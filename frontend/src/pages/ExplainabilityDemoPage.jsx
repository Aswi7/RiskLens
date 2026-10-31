import React, { useState } from 'react';
import { ExplainabilitySection } from '../components/ExplainabilitySection';
import { Sparkles, Activity, ShieldCheck, AlertCircle, ArrowLeft, Heart, RefreshCw } from 'lucide-react';

const HIGH_RISK_DATA = {
  input_payload: {
    Sex: 1,
    Age: 65,
    BMI: 34.5,
    HighBP: 1,
    HighChol: 1,
    Smoker: 1,
    PhysActivity: 0,
    Fruits: 0,
    Veggies: 0,
    HvyAlcoholConsump: 1,
    Stroke: 0,
    HeartDiseaseorAttack: 0,
    DiffWalk: 1,
    GenHlth: 4,
    MentHlth: 5,
    PhysHlth: 10,
    age: 65,
    sex: 1,
    cp: 2,
    trestbps: 155,
    chol: 275,
    fbs: 1,
    exang: 1
  },
  diabetes: {
    risk: { probability: 0.8097, isHighRisk: true, riskLevel: 'High Risk', threshold: 0.4 },
    shapValues: {
      Sex: 0.1121, Age: 0.2394, BMI: 0.5315, HighBP: 0.3551, HighChol: 0.2219,
      Smoker: -0.0029, PhysActivity: 0.048, Fruits: 0.0078, Veggies: 0.0139,
      HvyAlcoholConsump: -0.6799, Stroke: -0.0087, HeartDiseaseorAttack: -0.0436,
      DiffWalk: 0.1521, GenHlth: 0.5087, MentHlth: -0.0297, PhysHlth: 0.0201
    },
    userFacingFactors: [
      {
        featureKey: 'HvyAlcoholConsump',
        plainLabel: 'Heavy Alcohol Consumption',
        userValue: 'Yes',
        direction: 'lowers',
        strength: 'Moderate',
        changeability: 'changeable',
        note: 'High alcohol intake affects liver metabolism, triglycerides, and blood pressure.',
        rawShap: -0.6799
      },
      {
        featureKey: 'BMI',
        plainLabel: 'Body Mass Index',
        userValue: 'BMI 34',
        direction: 'raises',
        strength: 'Moderate',
        changeability: 'changeable',
        note: 'Body weight relative to height influences cellular insulin sensitivity and cardiac workload.',
        rawShap: 0.5315
      },
      {
        featureKey: 'GenHlth',
        plainLabel: 'General Health Rating',
        userValue: 'Fair',
        direction: 'raises',
        strength: 'Moderate',
        changeability: 'changeable',
        note: 'Self-rated vitality is a well-established indicator of systemic health.',
        rawShap: 0.5087
      },
      {
        featureKey: 'HighBP',
        plainLabel: 'High Blood Pressure',
        userValue: 'Yes',
        direction: 'raises',
        strength: 'Moderate',
        changeability: 'changeable',
        note: 'Elevated arterial pressure strains blood vessels and increases metabolic resistance.',
        rawShap: 0.3551
      },
      {
        featureKey: 'Age',
        plainLabel: 'Age',
        userValue: '65 years',
        direction: 'raises',
        strength: 'Slight',
        changeability: 'fixed',
        note: 'Metabolic and vascular risk naturally increases as the body matures.',
        rawShap: 0.2394
      }
    ],
    explainerType: 'TreeExplainer (XGBoost)',
    status: 'success'
  },
  heartDisease: {
    risk: { probability: 0.7968, isHighRisk: true, riskLevel: 'High Risk', threshold: 0.4 },
    shapValues: {
      age: 0.5391, sex: 0.5549, trestbps: 0.3226, chol: 0.1084, fbs: 0.1606,
      exang: 0.7516, cp_0: -0.6152, cp_1: 0.1567, cp_2: -0.527, cp_3: 0.0504
    },
    userFacingFactors: [
      {
        featureKey: 'exang',
        plainLabel: 'Exercise-Induced Discomfort',
        userValue: 'Yes',
        direction: 'raises',
        strength: 'Moderate',
        changeability: 'changeable',
        note: 'Chest tightness during exertion can indicate temporary cardiac oxygen strain.',
        rawShap: 0.7516
      },
      {
        featureKey: 'cp_0',
        plainLabel: 'Chest pain pattern (category 0)',
        userValue: 'Not reported',
        direction: 'lowers',
        strength: 'Moderate',
        changeability: 'fixed',
        note: 'Specific chest pain presentation reported during baseline evaluation.',
        rawShap: -0.6152
      },
      {
        featureKey: 'sex',
        plainLabel: 'Biological Sex',
        userValue: 'Male',
        direction: 'raises',
        strength: 'Moderate',
        changeability: 'fixed',
        note: 'Biological sex influences baseline hormonal profiles and cardiovascular patterns.',
        rawShap: 0.5549
      },
      {
        featureKey: 'age',
        plainLabel: 'Age',
        userValue: '65 years',
        direction: 'raises',
        strength: 'Moderate',
        changeability: 'fixed',
        note: 'Age is an established, non-modifiable cardiovascular baseline factor.',
        rawShap: 0.5391
      },
      {
        featureKey: 'cp_2',
        plainLabel: 'Chest pain pattern (category 2)',
        userValue: 'Reported',
        direction: 'lowers',
        strength: 'Moderate',
        changeability: 'fixed',
        note: 'Specific chest pain presentation reported during baseline evaluation.',
        rawShap: -0.527
      }
    ],
    explainerType: 'LinearExplainer (Logistic Regression)',
    status: 'success'
  }
};

const LOW_RISK_DATA = {
  input_payload: {
    Sex: 0,
    Age: 28,
    BMI: 22.0,
    HighBP: 0,
    HighChol: 0,
    Smoker: 0,
    PhysActivity: 1,
    Fruits: 1,
    Veggies: 1,
    HvyAlcoholConsump: 0,
    Stroke: 0,
    HeartDiseaseorAttack: 0,
    DiffWalk: 0,
    GenHlth: 1,
    MentHlth: 0,
    PhysHlth: 0,
    age: 28,
    sex: 0,
    cp: 0,
    trestbps: 112,
    chol: 175,
    fbs: 0,
    exang: 0
  },
  diabetes: {
    risk: { probability: 0.0124, isHighRisk: false, riskLevel: 'Low Risk', threshold: 0.4 },
    shapValues: {
      Sex: -0.104, Age: -1.1039, BMI: -0.5887, HighBP: -0.6015, HighChol: -0.3364,
      Smoker: -0.0159, PhysActivity: -0.0299, Fruits: -0.0169, Veggies: -0.0247,
      HvyAlcoholConsump: 0.0195, Stroke: -0.0226, HeartDiseaseorAttack: -0.0568,
      DiffWalk: -0.0541, GenHlth: -1.4618, MentHlth: 0.0407, PhysHlth: -0.0207
    },
    userFacingFactors: [
      {
        featureKey: 'GenHlth',
        plainLabel: 'General Health Rating',
        userValue: 'Excellent',
        direction: 'lowers',
        strength: 'Strong',
        changeability: 'changeable',
        note: 'Self-rated vitality is a well-established indicator of systemic health.',
        rawShap: -1.4618
      },
      {
        featureKey: 'Age',
        plainLabel: 'Age',
        userValue: '28 years',
        direction: 'lowers',
        strength: 'Moderate',
        changeability: 'fixed',
        note: 'Metabolic and vascular risk naturally increases as the body matures.',
        rawShap: -1.1039
      },
      {
        featureKey: 'HighBP',
        plainLabel: 'High Blood Pressure',
        userValue: 'No',
        direction: 'lowers',
        strength: 'Slight',
        changeability: 'changeable',
        note: 'Elevated arterial pressure strains blood vessels and increases metabolic resistance.',
        rawShap: -0.6015
      },
      {
        featureKey: 'BMI',
        plainLabel: 'Body Mass Index',
        userValue: 'BMI 22',
        direction: 'lowers',
        strength: 'Slight',
        changeability: 'changeable',
        note: 'Body weight relative to height influences cellular insulin sensitivity and cardiac workload.',
        rawShap: -0.5887
      },
      {
        featureKey: 'HighChol',
        plainLabel: 'High Cholesterol History',
        userValue: 'No',
        direction: 'lowers',
        strength: 'Slight',
        changeability: 'changeable',
        note: 'Elevated blood lipids can accumulate along arterial walls over time.',
        rawShap: -0.3364
      }
    ],
    explainerType: 'TreeExplainer (XGBoost)',
    status: 'success'
  },
  heartDisease: {
    risk: { probability: 0.0736, isHighRisk: false, riskLevel: 'Low Risk', threshold: 0.4 },
    shapValues: {
      age: -1.342, sex: -1.1237, trestbps: -0.2647, chol: -0.3176, fbs: -0.0299,
      exang: -0.3923, cp_0: 0.6682, cp_1: 0.1567, cp_2: 0.1976, cp_3: 0.0504
    },
    userFacingFactors: [
      {
        featureKey: 'age',
        plainLabel: 'Age',
        userValue: '28 years',
        direction: 'lowers',
        strength: 'Moderate',
        changeability: 'fixed',
        note: 'Age is an established, non-modifiable cardiovascular baseline factor.',
        rawShap: -1.342
      },
      {
        featureKey: 'sex',
        plainLabel: 'Biological Sex',
        userValue: 'Female',
        direction: 'lowers',
        strength: 'Moderate',
        changeability: 'fixed',
        note: 'Biological sex influences baseline hormonal profiles and cardiovascular patterns.',
        rawShap: -1.1237
      },
      {
        featureKey: 'cp_0',
        plainLabel: 'Chest pain pattern (category 0)',
        userValue: 'Reported',
        direction: 'raises',
        strength: 'Moderate',
        changeability: 'fixed',
        note: 'Specific chest pain presentation reported during baseline evaluation.',
        rawShap: 0.6682
      },
      {
        featureKey: 'exang',
        plainLabel: 'Exercise-Induced Discomfort',
        userValue: 'No',
        direction: 'lowers',
        strength: 'Slight',
        changeability: 'changeable',
        note: 'Chest tightness during exertion can indicate temporary cardiac oxygen strain.',
        rawShap: -0.3923
      },
      {
        featureKey: 'chol',
        plainLabel: 'Total Cholesterol',
        userValue: '175 mg/dL',
        direction: 'lowers',
        strength: 'Slight',
        changeability: 'changeable',
        note: 'Serum cholesterol levels directly influence vascular and plaque dynamics.',
        rawShap: -0.3176
      }
    ],
    explainerType: 'LinearExplainer (Logistic Regression)',
    status: 'success'
  }
};

export const ExplainabilityDemoPage = () => {
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialProfile = searchParams.get('profile') || 'high';
  const initialDisease = searchParams.get('disease') || 'diabetes';
  const initialTech = searchParams.get('tech') === 'true';
  const initialNote = searchParams.get('note') === 'true';
  const initialSim = searchParams.get('simulated') === 'true';

  const [profileType, setProfileType] = useState(initialProfile); // 'high' or 'low'
  const currentData = profileType === 'high' ? HIGH_RISK_DATA : LOW_RISK_DATA;

  const mockWhatIfResults = initialSim ? {
    originalInputs: { BMI: 34.5, PhysActivity: 0, Smoker: 1, Fruits: 0, Veggies: 0 },
    newInputs: { BMI: 25.0, PhysActivity: 1, Smoker: 0, Fruits: 1, Veggies: 1 },
    diabetes: {
      originalProbability: 0.8097,
      originalRiskLevel: "High Risk",
      newProbability: 0.3620,
      newRiskLevel: "Low Risk",
      probabilityDelta: -0.4477,
      riskCategoryChanged: true
    },
    heartDisease: {
      originalProbability: 0.7968,
      originalRiskLevel: "High Risk",
      newProbability: 0.4850,
      newRiskLevel: "Moderate Risk",
      probabilityDelta: -0.3118,
      riskCategoryChanged: true
    },
    disclaimer: "an estimate, not a promise"
  } : null;

  // Two-sentence LLM whyThisScore samples for each profile
  const whyThisScore = profileType === 'high'
    ? {
        diabetes: "Your diabetes assessment is primarily influenced by your body mass index and high blood pressure, which contribute to your overall risk score. On the other hand, your daily vegetable intake actively works to protect your long-term health.",
        heartDisease: "Your cardiovascular estimate is shaped by exercise-induced discomfort and higher blood pressure readings. Conversely, your non-smoking status offers steady protection against arterial strain."
      }
    : {
        diabetes: "Your low score is heavily driven by your excellent general vitality and youthful age bracket. In addition, your healthy body mass index and active lifestyle serve as strong protective buffers against metabolic disease.",
        heartDisease: "Your heart health trajectory benefits substantially from your young age and favorable resting blood pressure. Furthermore, your consistent exercise regimen provides a resilient cardiovascular foundation."
      };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-black text-xl shadow-xs">
              RL
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading font-black text-xl text-slate-900 tracking-tight">
                  risk<span className="text-teal-600">Lens</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-200 uppercase">
                  SHAP Explainability Suite
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Human-Centric Feature Attributions &amp; What-If Counterfactual Sandbox
              </p>
            </div>
          </div>

          {/* Profile Switcher Controls */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              id="btn-high-risk"
              onClick={() => setProfileType('high')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                profileType === 'high'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>High-Risk Test User</span>
            </button>
            <button
              id="btn-low-risk"
              onClick={() => setProfileType('low')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                profileType === 'low'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Low-Risk Test User</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Profile Overview Banner */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
              Active Evaluation Subject
            </div>
            <h2 className="font-heading text-xl font-bold text-slate-900 mt-0.5">
              {profileType === 'high' ? 'Subject A: Elevated Metabolic & Vascular Profile (Age 65)' : 'Subject B: Protective Baseline Profile (Age 28)'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {profileType === 'high'
                ? 'BMI 34.5 | High BP | Smoker | Sedentary | Sub-optimal Diet | Previous Chest Discomfort'
                : 'BMI 22.0 | Normal BP | Non-smoker | Daily Exercise | High Fruit & Veggies'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Diabetes: {profileType === 'high' ? '81% (High Risk)' : '1% (Low Risk)'}</span>
            </div>
            <div className="px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span>Heart: {profileType === 'high' ? '80% (High Risk)' : '7% (Low Risk)'}</span>
            </div>
          </div>
        </div>

        {/* 1. WHY YOUR RESULTS LOOK THIS WAY (LLM 2-SENTENCE EXTENSION) */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-teal-400 font-extrabold text-sm uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span>AI Clinical Summary: Why Your Results Look This Way</span>
            </div>
            <span className="text-[11px] text-teal-300 bg-teal-950 px-3 py-1 rounded-full border border-teal-800 font-medium">
              Strict 2-Sentence Rule • Zero Numbers • Non-Diagnostic
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60 space-y-2">
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Type 2 Diabetes Context</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                {whyThisScore.diabetes}
              </p>
            </div>

            <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700/60 space-y-2">
              <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                <span>Heart Disease Context</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                {whyThisScore.heartDisease}
              </p>
            </div>
          </div>
        </div>

        {/* 2. THE MAIN SHAP EXPLAINABILITY COMPONENT */}
        <ExplainabilitySection
          key={`${profileType}-${initialDisease}-${initialTech}-${initialSim}`}
          predictionData={currentData}
          defaultDisease={initialDisease}
          defaultShowTechnical={initialTech}
          defaultShowNote={initialNote}
          defaultWhatIfResults={mockWhatIfResults}
        />
      </main>
    </div>
  );
};

export default ExplainabilityDemoPage;
