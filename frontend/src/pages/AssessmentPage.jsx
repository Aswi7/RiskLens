import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, ArrowLeft, Check, Sparkles, Upload, Watch, Lock, AlertCircle, Plus, X, Search, ShieldCheck, HeartPulse } from 'lucide-react';
import api from '../services/api';

export const AssessmentPage = () => {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  // Search filter for symptoms step
  const [symptomSearch, setSymptomSearch] = useState('');

  // Available symptom options for picker
  const availableSymptoms = [
    { key: 'frequent_urination', label: 'Frequent Urination', category: 'Metabolic' },
    { key: 'chest_pain', label: 'Chest Pain / Tightness', category: 'Cardiovascular' },
    { key: 'shortness_of_breath', label: 'Shortness of Breath', category: 'Cardiorespiratory' },
    { key: 'extreme_thirst', label: 'Extreme Thirst (Polydipsia)', category: 'Metabolic' },
    { key: 'fatigue', label: 'Unexplained Fatigue', category: 'General' },
    { key: 'dizziness', label: 'Dizziness / Lightheadedness', category: 'Neurological' },
    { key: 'palpitations', label: 'Heart Palpitations', category: 'Cardiovascular' },
    { key: 'blurred_vision', label: 'Blurred Vision', category: 'Ocular/Metabolic' },
    { key: 'numbness', label: 'Numbness / Tingling in Extremities', category: 'Neurological' },
  ];

  // Form Data State
  const [formData, setFormData] = useState({
    // Step 1: Basic Profile
    age: '',
    gender: 'female',
    height: '',
    weight: '',
    // Step 2: Lifestyle Questionnaire
    exercise: 'moderate',
    diet: 'average',
    sleepHours: '7.0',
    sleepQuality: 'fair',
    smoking: 'never',
    alcohol: 'none',
    stressLevel: '5',
    dailySteps: '6000',

    // Step 3: Medical History (Full Checkboxes)
    // Options: Diabetes, Hypertension, Asthma, Kidney Disease, Thyroid, Heart Disease
    medicalHistory: [],

    // Step 4: Family History (Grouped by Relative)
    // Stored as { father: [...], mother: [...], siblings: [...] }
    familyHistory: {
      father: [],
      mother: [],
      siblings: []
    },

    // Step 5: Full Symptom Selector
    // Array of objects: { symptom: string, severity: 1..5, duration: string, frequency: string }
    selectedSymptoms: [],
    symptomFollowups: {
      increasedThirst: false,
      weightLoss: false
    },
    chestPainType: 'none', // Maps to Heart Disease model cp parameter
    exerciseAngina: false, // Maps to Heart Disease model exang parameter

    // Step 6: Vitals
    glucose: '',
    bpSystolic: '',
    bpDiastolic: '',
    heartRate: '',
    fastingGlucose: '',
    totalCholesterol: '',

    // Step 7: Lab OCR
    labReportUploaded: false,

    // Step 8: Mental Wellness (Optional, clearly separated)
    mentalWellness: {
      skipped: false,
      anxious: false,
      depressed: false,
      difficultyConcentrating: false
    },

    // Step 9: Wearable Data
    wearableSynced: false,
    restingHeartRate: '72',
  });

  // Dynamic BMI Calculation
  const heightM = parseFloat(formData.height) / 100 || 0;
  const weightKg = parseFloat(formData.weight) || 0;
  const bmi = heightM > 0 && weightKg > 0 ? (weightKg / (heightM * heightM)).toFixed(1) : '—';

  const getBmiCategory = (valStr) => {
    const val = parseFloat(valStr);
    if (!val || isNaN(val)) return { label: 'Enter Height & Weight', color: 'text-slate-500 bg-slate-100' };
    if (val < 18.5) return { label: 'Underweight Zone', color: 'text-amber-600 bg-amber-50' };
    if (val < 25) return { label: 'Healthy Weight Zone', color: 'text-emerald-600 bg-emerald-50' };
    if (val < 30) return { label: 'Overweight Zone', color: 'text-amber-600 bg-amber-50' };
    return { label: 'Obese Zone', color: 'text-rose-600 bg-rose-50' };
  };

  // Client-side Transparent Non-ML Health Score Preview Calculator
  const computeClientHealthScore = () => {
    let smokePts = formData.smoking === 'never' ? 12 : formData.smoking === 'former' ? 7 : 2;
    let alcoholPts = formData.alcohol === 'none' || formData.alcohol === 'occasional' ? 8 : 3;
    let lifestyleScore = Math.min(20, smokePts + alcoholPts);

    let exPts = formData.exercise === 'high' ? 12 : formData.exercise === 'moderate' ? 8 : 4;
    let stepPts = parseFloat(formData.dailySteps) >= 10000 ? 8 : parseFloat(formData.dailySteps) >= 6000 ? 6 : 4;
    let fitnessScore = Math.min(20, exPts + stepPts);

    let dietPts = formData.diet === 'healthy' ? 12 : formData.diet === 'average' ? 8 : 4;
    let producePts = formData.diet === 'healthy' ? 8 : 5;
    let nutritionScore = Math.min(20, dietPts + producePts);

    let hrs = parseFloat(formData.sleepHours) || 7.0;
    let hrsPts = hrs >= 7.0 && hrs <= 9.0 ? 12 : 8;
    let qualPts = formData.sleepQuality === 'good' ? 8 : formData.sleepQuality === 'fair' ? 5 : 3;
    let sleepScore = Math.min(20, hrsPts + qualPts);

    let stress = parseFloat(formData.stressLevel) || 5;
    let stressScore = stress <= 3 ? 20 : stress <= 5 ? 16 : stress <= 7 ? 10 : 5;

    let total = lifestyleScore + fitnessScore + nutritionScore + sleepScore + stressScore;

    return {
      total,
      breakdown: {
        lifestyle: lifestyleScore,
        fitness: fitnessScore,
        nutrition: nutritionScore,
        sleep: sleepScore,
        stress: stressScore
      }
    };
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Handlers for Medical History Checkboxes
  const toggleMedicalHistory = (condition) => {
    setFormData((prev) => {
      const exists = prev.medicalHistory.includes(condition);
      const updated = exists
        ? prev.medicalHistory.filter((c) => c !== condition)
        : [...prev.medicalHistory, condition];
      return { ...prev, medicalHistory: updated };
    });
  };

  // Handlers for Family History Checkboxes
  const toggleFamilyCondition = (relative, condition) => {
    setFormData((prev) => {
      const currentList = prev.familyHistory[relative] || [];
      const exists = currentList.includes(condition);
      const updatedList = exists
        ? currentList.filter((c) => c !== condition)
        : [...currentList, condition];
      return {
        ...prev,
        familyHistory: {
          ...prev.familyHistory,
          [relative]: updatedList
        }
      };
    });
  };

  // Handlers for Symptom Selector
  const toggleSymptomSelection = (symptomObj) => {
    setFormData((prev) => {
      const exists = prev.selectedSymptoms.some((s) => s.symptom === symptomObj.label);
      if (exists) {
        return {
          ...prev,
          selectedSymptoms: prev.selectedSymptoms.filter((s) => s.symptom !== symptomObj.label)
        };
      } else {
        return {
          ...prev,
          selectedSymptoms: [
            ...prev.selectedSymptoms,
            {
              symptom: symptomObj.label,
              key: symptomObj.key,
              severity: 3,
              duration: '1 week',
              frequency: 'sometimes'
            }
          ]
        };
      }
    });
  };

  const updateSymptomDetail = (symptomName, key, val) => {
    setFormData((prev) => ({
      ...prev,
      selectedSymptoms: prev.selectedSymptoms.map((s) =>
        s.symptom === symptomName ? { ...s, [key]: val } : s
      )
    }));
  };

  // Fast-Track Demo Presets for Quick Evaluation
  const loadPreset = (type) => {
    if (type === 'moderate') {
      setFormData({
        age: '48',
        gender: 'female',
        height: '162',
        weight: '78',
        exercise: 'low',
        diet: 'average',
        sleepHours: '6.0',
        sleepQuality: 'poor',
        smoking: 'former',
        alcohol: 'occasional',
        stressLevel: '7',
        dailySteps: '4200',
        medicalHistory: ['Hypertension', 'Diabetes', 'Heart Disease'],
        familyHistory: {
          father: ['Diabetes', 'Heart Disease', 'Hypertension'],
          mother: ['High Cholesterol'],
          siblings: ['Diabetes']
        },
        selectedSymptoms: [
          { symptom: 'Frequent Urination', key: 'frequent_urination', severity: 3, duration: '1 week', frequency: 'daily' },
          { symptom: 'Chest Pain / Tightness', key: 'chest_pain', severity: 4, duration: '3 days', frequency: 'sometimes' },
          { symptom: 'Unexplained Fatigue', key: 'fatigue', severity: 3, duration: '1 month', frequency: 'daily' }
        ],
        symptomFollowups: {
          increasedThirst: true,
          weightLoss: true
        },
        chestPainType: 'atypical',
        exerciseAngina: true,
        glucose: '142',
        bpSystolic: '138',
        bpDiastolic: '88',
        heartRate: '78',
        fastingGlucose: '126',
        totalCholesterol: '235',
        labReportUploaded: true,
        mentalWellness: {
          skipped: false,
          anxious: true,
          depressed: false,
          difficultyConcentrating: true
        },
        wearableSynced: true,
        restingHeartRate: '78'
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
        sleepQuality: 'good',
        smoking: 'never',
        alcohol: 'none',
        stressLevel: '3',
        dailySteps: '10500',
        medicalHistory: [],
        familyHistory: {
          father: [],
          mother: [],
          siblings: []
        },
        selectedSymptoms: [],
        symptomFollowups: {
          increasedThirst: false,
          weightLoss: false
        },
        chestPainType: 'none',
        exerciseAngina: false,
        glucose: '92',
        bpSystolic: '118',
        bpDiastolic: '76',
        heartRate: '64',
        fastingGlucose: '88',
        totalCholesterol: '175',
        labReportUploaded: false,
        mentalWellness: {
          skipped: false,
          anxious: false,
          depressed: false,
          difficultyConcentrating: false
        },
        wearableSynced: true,
        restingHeartRate: '62'
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
    setErrorMsg(null);
    setLoadingStage('Connecting to RiskLens Backend API...');

    try {
      await new Promise((r) => setTimeout(r, 400));
      setLoadingStage('Evaluating Diabetes XGBoost Model & Heart Disease Logistic Model...');

      const cpMap = {
        none: 0,
        atypical: 1,
        typical: 2,
        'non-anginal': 3
      };

      const payload = {
        // Shared parameters for ML models
        Sex: formData.gender === 'male' ? 1 : 0,
        sex: formData.gender === 'male' ? 1 : 0,
        Age: parseFloat(formData.age) || 45,
        age: parseFloat(formData.age) || 45,
        BMI: bmi !== '—' ? parseFloat(bmi) : 25,

        // Diabetes parameters (16 features)
        HighBP: (formData.medicalHistory.includes('Hypertension') || parseFloat(formData.bpSystolic) >= 130) ? 1 : 0,
        HighChol: parseFloat(formData.totalCholesterol) >= 200 ? 1 : 0,
        Smoker: formData.smoking !== 'never' ? 1 : 0,
        PhysActivity: formData.exercise !== 'low' ? 1 : 0,
        Fruits: formData.diet === 'healthy' || formData.diet === 'average' ? 1 : 0,
        Veggies: formData.diet === 'healthy' || formData.diet === 'average' ? 1 : 0,
        HvyAlcoholConsump: formData.alcohol === 'regular' ? 1 : 0,
        Stroke: formData.medicalHistory.includes('Heart Disease') ? 1 : 0,
        HeartDiseaseorAttack: (formData.medicalHistory.includes('Heart Disease') || (formData.familyHistory.father && formData.familyHistory.father.includes('Heart Disease')) || (formData.familyHistory.mother && formData.familyHistory.mother.includes('Heart Disease'))) ? 1 : 0,
        DiffWalk: formData.exercise === 'low' ? 1 : 0,
        GenHlth: formData.diet === 'healthy' ? 2 : formData.diet === 'average' ? 3 : 4,
        MentHlth: parseFloat(formData.stressLevel) || 5,
        PhysHlth: formData.exercise === 'high' ? 0 : 2,

        // Heart Disease parameters (7 raw fields)
        trestbps: parseFloat(formData.bpSystolic) || 120,
        chol: parseFloat(formData.totalCholesterol) || 200,
        fbs: (parseFloat(formData.glucose) > 120 || parseFloat(formData.fastingGlucose) > 120) ? 1 : 0,
        exang: formData.exerciseAngina ? 1 : 0,
        cp: cpMap[formData.chestPainType] ?? 0,

        // --- NON-ML ONBOARDING INTAKE (Feeds MongoDB & LLM Context ONLY, NOT passed to ML prediction models) ---
        medicalHistory: formData.medicalHistory,
        familyHistory: formData.familyHistory,
        symptoms: formData.selectedSymptoms,
        symptomFollowups: formData.symptomFollowups,
        mentalWellness: formData.mentalWellness,
        exercise: formData.exercise,
        diet: formData.diet,
        sleepHours: formData.sleepHours,
        sleepQuality: formData.sleepQuality,
        smoking: formData.smoking,
        alcohol: formData.alcohol,
        stressLevel: formData.stressLevel,
        dailySteps: formData.dailySteps
      };

      setLoadingStage('Computing Per-Feature SHAP Contribution Vectors & Non-ML Health Score...');
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
    } catch (err) {
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
          {/* Fast-Track Demo Presets Bar on Step 1 */}
          {currentStep === 1 && (
            <div className="mb-8 p-4 bg-teal-50/60 border border-teal-200/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  Fast-Track Demo Presets
                </div>
                <p className="text-xs text-teal-700 mt-0.5">
                  Auto-fill all 10 steps for an instant ML & LLM evaluation test.
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

          {/* Step 2: Lifestyle Questionnaire */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Lifestyle Questionnaire</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Lifestyle answers feed your transparent non-ML Health Score and personalized AI recommendations.
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
                    <option value="low">Low / Sedentary (&lt;60 mins/week)</option>
                    <option value="moderate">Moderate (60-150 mins/week)</option>
                    <option value="high">Active (150+ mins/week)</option>
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
                    <option value="poor">High processed foods / Low produce</option>
                    <option value="average">Balanced diet (Moderate fruits &amp; veggies)</option>
                    <option value="healthy">Plant-rich / Mediterranean (High produce)</option>
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
                    Sleep Quality Rating
                  </label>
                  <select
                    value={formData.sleepQuality}
                    onChange={(e) => handleInputChange('sleepQuality', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="poor">Poor — Frequent awakenings / insomnia</option>
                    <option value="fair">Fair — Restful some nights</option>
                    <option value="good">Good / Excellent — Consistently restful</option>
                  </select>
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Alcohol Intake
                  </label>
                  <select
                    value={formData.alcohol}
                    onChange={(e) => handleInputChange('alcohol', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="none">None / Rare</option>
                    <option value="occasional">Occasional (1-3 drinks/week)</option>
                    <option value="regular">Regular / Heavy (4+ drinks/week)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Medical History (Full Checkboxes) */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Medical History (Full)</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Select any pre-existing medical diagnoses. Stored in your <code className="bg-slate-100 px-1 py-0.5 rounded text-xs text-slate-700 font-mono">medicalHistory</code> database collection.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { id: 'Diabetes', label: 'Diabetes', desc: 'Type 1 or Type 2 Diabetes diagnosis' },
                  { id: 'Hypertension', label: 'Hypertension', desc: 'High Blood Pressure diagnosis (≥130/80 mmHg)' },
                  { id: 'Asthma', label: 'Asthma', desc: 'Chronic respiratory airways hyperreactivity' },
                  { id: 'Kidney Disease', label: 'Kidney Disease', desc: 'Chronic kidney disease or impaired eGFR' },
                  { id: 'Thyroid', label: 'Thyroid Disorder', desc: 'Hypothyroidism or hyperthyroidism' },
                  { id: 'Heart Disease', label: 'Heart Disease', desc: 'Coronary artery disease, angina, or prior event' },
                ].map((item) => {
                  const isChecked = formData.medicalHistory.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      onClick={() => toggleMedicalHistory(item.id)}
                      className={`flex items-start p-4 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'border-teal-500 bg-teal-50/50 text-slate-900 font-semibold shadow-xs'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-1 w-4 h-4 text-teal-600 rounded-md focus:ring-teal-500"
                      />
                      <div className="ml-3">
                        <span className="text-sm block font-bold">{item.label}</span>
                        <span className="text-xs text-slate-500 block mt-0.5">{item.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Family History (Grouped by Relative) */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Family History (by Relative)</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Select condition options grouped by relative. Enriches MongoDB storage and LLM prompt context for recommendations and chat.
                </p>
              </div>

              {['father', 'mother', 'siblings'].map((relKey) => {
                const relLabel = relKey === 'father' ? 'Father' : relKey === 'mother' ? 'Mother' : 'Siblings';
                const conditionsList = ['Diabetes', 'Heart Disease', 'Hypertension', 'High Cholesterol', 'Stroke'];
                const selectedForRel = formData.familyHistory[relKey] || [];

                return (
                  <div key={relKey} className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 font-extrabold text-xs flex items-center justify-center">
                        {relLabel.charAt(0)}
                      </div>
                      <h3 className="font-heading font-bold text-base text-slate-900">{relLabel}'s Medical Conditions</h3>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {conditionsList.map((cond) => {
                        const isChecked = selectedForRel.includes(cond);
                        return (
                          <label
                            key={cond}
                            onClick={() => toggleFamilyCondition(relKey, cond)}
                            className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                              isChecked
                                ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="hidden"
                            />
                            <span>{isChecked ? '✓' : '+'}</span>
                            <span>{cond}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 5: Full Symptom Selector with Severity, Duration, Frequency & Adaptive Follow-ups */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Full Symptom Selector</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Search and pick symptoms. For each selected symptom, capture severity (1-5), duration, frequency, and adaptive follow-ups.
                </p>
              </div>

              {/* Symptom Picker Header & Search */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={symptomSearch}
                    onChange={(e) => setSymptomSearch(e.target.value)}
                    placeholder="Search symptoms (e.g., chest pain, frequent urination, fatigue)..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {availableSymptoms
                    .filter((s) => s.label.toLowerCase().includes(symptomSearch.toLowerCase()))
                    .map((sym) => {
                      const isSelected = formData.selectedSymptoms.some((s) => s.symptom === sym.label);
                      return (
                        <button
                          key={sym.key}
                          type="button"
                          onClick={() => toggleSymptomSelection(sym)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                            isSelected
                              ? 'bg-slate-900 text-teal-400 border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Plus className="w-3.5 h-3.5 text-slate-400" />}
                          <span>{sym.label}</span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Selected Symptoms Detailed Cards */}
              {formData.selectedSymptoms.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="font-heading font-bold text-sm text-slate-800 uppercase tracking-wider">
                    Selected Symptoms Detail ({formData.selectedSymptoms.length})
                  </h3>

                  {formData.selectedSymptoms.map((symObj) => (
                    <div key={symObj.symptom} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">{symObj.symptom}</span>
                        <button
                          type="button"
                          onClick={() => toggleSymptomSelection({ label: symObj.symptom })}
                          className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            Severity (1 = Mild, 5 = Extreme)
                          </label>
                          <select
                            value={symObj.severity}
                            onChange={(e) => updateSymptomDetail(symObj.symptom, 'severity', parseInt(e.target.value))}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                          >
                            <option value={1}>1 — Very Mild</option>
                            <option value={2}>2 — Mild</option>
                            <option value={3}>3 — Moderate</option>
                            <option value={4}>4 — Severe</option>
                            <option value={5}>5 — Extreme / Critical</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            Duration
                          </label>
                          <select
                            value={symObj.duration}
                            onChange={(e) => updateSymptomDetail(symObj.symptom, 'duration', e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                          >
                            <option value="today">Today</option>
                            <option value="3 days">3 Days</option>
                            <option value="1 week">1 Week</option>
                            <option value="1 month">1 Month+</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                            Frequency
                          </label>
                          <select
                            value={symObj.frequency}
                            onChange={(e) => updateSymptomDetail(symObj.symptom, 'frequency', e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                          >
                            <option value="sometimes">Sometimes / Intermittent</option>
                            <option value="daily">Daily</option>
                            <option value="continuous">Continuous / Constant</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Adaptive Follow-up: Frequent Urination */}
              {formData.selectedSymptoms.some((s) => s.symptom === 'Frequent Urination') && (
                <div className="p-4 bg-teal-50/80 border border-teal-200 rounded-2xl space-y-3">
                  <div className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    Adaptive Follow-up: Frequent Urination
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="flex items-center p-3 bg-white rounded-xl border border-teal-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.symptomFollowups.increasedThirst}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            symptomFollowups: { ...prev.symptomFollowups, increasedThirst: e.target.checked }
                          }))
                        }
                        className="w-4 h-4 text-teal-600 rounded-md focus:ring-teal-500"
                      />
                      <span className="ml-2.5 text-xs font-semibold text-slate-800">Experiencing increased thirst (Polydipsia)?</span>
                    </label>

                    <label className="flex items-center p-3 bg-white rounded-xl border border-teal-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.symptomFollowups.weightLoss}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            symptomFollowups: { ...prev.symptomFollowups, weightLoss: e.target.checked }
                          }))
                        }
                        className="w-4 h-4 text-teal-600 rounded-md focus:ring-teal-500"
                      />
                      <span className="ml-2.5 text-xs font-semibold text-slate-800">Experiencing unexplained weight loss?</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Adaptive Follow-up: Chest Pain */}
              {formData.selectedSymptoms.some((s) => s.symptom === 'Chest Pain / Tightness') && (
                <div className="p-4 bg-red-50/80 border border-red-200 rounded-2xl space-y-3">
                  <div className="text-xs font-bold text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-red-600" />
                    Adaptive Follow-up: Chest Pain Characterization (ML Heart Model Mapping)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                        Chest Pain Type
                      </label>
                      <select
                        value={formData.chestPainType}
                        onChange={(e) => handleInputChange('chestPainType', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-red-200 rounded-xl text-xs font-semibold"
                      >
                        <option value="none">None — No tightness</option>
                        <option value="atypical">Atypical Angina — Occasional tightness</option>
                        <option value="typical">Typical Angina — Pressure during physical stress</option>
                        <option value="non-anginal">Non-Anginal Pain — Sharp brief pain</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center p-3 bg-white rounded-xl border border-red-200 cursor-pointer w-full">
                        <input
                          type="checkbox"
                          checked={formData.exerciseAngina}
                          onChange={(e) => handleInputChange('exerciseAngina', e.target.checked)}
                          className="w-4 h-4 text-red-600 rounded-md focus:ring-red-500"
                        />
                        <span className="ml-2.5 text-xs font-semibold text-slate-800">Exercise-Induced Angina (Chest pain on effort)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Vitals */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Clinical Vitals</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Quantitative inputs evaluated by XGBoost &amp; Logistic Regression ML models.
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
                  Optional: Upload blood panel report to import glucose &amp; cholesterol automatically.
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-200 hover:border-teal-400 rounded-2xl p-8 text-center bg-slate-50/50 transition-colors">
                <Upload className="w-10 h-10 text-teal-600 mx-auto mb-3" />
                <h3 className="font-semibold text-slate-800 text-sm">Upload Blood Panel PDF or Image</h3>
                <p className="text-xs text-slate-400 mt-1">Supports standard lab reports (PDF, PNG, JPG)</p>

                <button
                  type="button"
                  onClick={() => {
                    handleInputChange('labReportUploaded', true);
                    handleInputChange('glucose', '135');
                    handleInputChange('totalCholesterol', '224');
                    handleInputChange('bpSystolic', '132');
                    handleInputChange('bpDiastolic', '84');
                    alert('Lab OCR Parse Simulated! Glucose (135 mg/dL), Cholesterol (224 mg/dL), and BP (132/84 mmHg) populated.');
                  }}
                  className="mt-4 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                >
                  ⚡ Simulate Lab Report OCR Import
                </button>
              </div>
            </div>
          )}

          {/* Step 8: Mental Wellness (Optional, Clearly Separated) */}
          {currentStep === 8 && (
            <div className="space-y-6">
              {/* Distinct Visual Card Header & Non-Diagnostic Disclaimer */}
              <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                    Optional Wellness Section — Non-Diagnostic
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        mentalWellness: { ...prev.mentalWellness, skipped: true }
                      }));
                      handleNext();
                    }}
                    className="text-xs font-bold text-indigo-700 hover:underline cursor-pointer"
                  >
                    Skip This Step →
                  </button>
                </div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Mental Wellness &amp; Stress</h2>
                <p className="text-xs text-indigo-900 font-medium leading-relaxed">
                  Notice: This optional self-assessment provides non-diagnostic context for AI recommendations only. It is stored in the <code className="font-mono bg-indigo-100 px-1 py-0.5 rounded">wellness</code> collection, fed to LLM context ONLY, and is NEVER passed to ML disease prediction models or treated as a clinical diagnostic screen.
                </p>
              </div>

              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-semibold text-slate-800">Do you frequently feel anxious, nervous, or on edge?</span>
                  <input
                    type="checkbox"
                    checked={formData.mentalWellness.anxious}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        mentalWellness: { ...prev.mentalWellness, anxious: e.target.checked, skipped: false }
                      }))
                    }
                    className="w-5 h-5 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-semibold text-slate-800">Do you frequently feel down, depressed, or hopeless?</span>
                  <input
                    type="checkbox"
                    checked={formData.mentalWellness.depressed}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        mentalWellness: { ...prev.mentalWellness, depressed: e.target.checked, skipped: false }
                      }))
                    }
                    className="w-5 h-5 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <span className="text-sm font-semibold text-slate-800">Do you experience difficulty concentrating or staying focused?</span>
                  <input
                    type="checkbox"
                    checked={formData.mentalWellness.difficultyConcentrating}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        mentalWellness: { ...prev.mentalWellness, difficultyConcentrating: e.target.checked, skipped: false }
                      }))
                    }
                    className="w-5 h-5 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
                  />
                </label>

                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Perceived Stress Level (1 = Low, 10 = High)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={formData.stressLevel}
                    onChange={(e) => handleInputChange('stressLevel', e.target.value)}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-slate-500 font-semibold mt-1">
                    <span>1 (Low Stress)</span>
                    <span className="text-indigo-700 font-extrabold text-sm">Rating: {formData.stressLevel}/10</span>
                    <span>10 (High Stress)</span>
                  </div>
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
                  Your inputs will be sent to the RiskLens FastAPI Backend ML pipeline and non-ML health score engine.
                </p>
              </div>

              {/* Transparent Non-ML Health Score Preview */}
              {(() => {
                const hs = computeClientHealthScore();
                return (
                  <div className="p-6 bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 text-white rounded-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div>
                        <div className="text-[10px] text-teal-300 uppercase font-extrabold tracking-wider">
                          Transparent Non-ML Health Score Preview
                        </div>
                        <div className="text-3xl font-extrabold text-white mt-0.5">
                          {hs.total} <span className="text-sm font-normal text-slate-300">/ 100</span>
                        </div>
                      </div>
                      <span className="px-3.5 py-1 bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-full text-xs font-extrabold uppercase">
                        Deterministic Formula (NOT ML)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                      <div className="p-2 bg-white/10 rounded-xl">
                        <span className="block text-[10px] text-slate-300">Lifestyle</span>
                        <span className="font-extrabold text-teal-300">{hs.breakdown.lifestyle}/20</span>
                      </div>
                      <div className="p-2 bg-white/10 rounded-xl">
                        <span className="block text-[10px] text-slate-300">Fitness</span>
                        <span className="font-extrabold text-teal-300">{hs.breakdown.fitness}/20</span>
                      </div>
                      <div className="p-2 bg-white/10 rounded-xl">
                        <span className="block text-[10px] text-slate-300">Nutrition</span>
                        <span className="font-extrabold text-teal-300">{hs.breakdown.nutrition}/20</span>
                      </div>
                      <div className="p-2 bg-white/10 rounded-xl">
                        <span className="block text-[10px] text-slate-300">Sleep</span>
                        <span className="font-extrabold text-teal-300">{hs.breakdown.sleep}/20</span>
                      </div>
                      <div className="p-2 bg-white/10 rounded-xl">
                        <span className="block text-[10px] text-slate-300">Stress</span>
                        <span className="font-extrabold text-teal-300">{hs.breakdown.stress}/20</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Age</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.age || '45'} yrs</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">BMI</div>
                  <div className="text-lg font-extrabold text-slate-900">{bmi !== '—' ? bmi : '25.0'} kg/m²</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">BP Systolic</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.bpSystolic || '120'} mmHg</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Glucose</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.glucose || '100'} mg/dL</div>
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
                  <span>Submit Assessment</span>
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
