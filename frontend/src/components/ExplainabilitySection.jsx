import React, { useState } from 'react';
import {
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  TrendingUp,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info,
  Lock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Cpu
} from 'lucide-react';
import { simulateWhatIf } from '../services/api';

export const ExplainabilitySection = ({
  predictionData,
  defaultDisease = 'diabetes',
  defaultShowTechnical = false,
  defaultShowNote = false,
  defaultWhatIfResults = null
}) => {
  const [selectedDisease, setSelectedDisease] = useState(defaultDisease);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(defaultShowTechnical);
  const [showHowToReadNote, setShowHowToReadNote] = useState(defaultShowNote);

  // What-If Simulation State
  const initialBmi = predictionData?.input_payload?.BMI || 27.0;
  const initialPhys = predictionData?.input_payload?.PhysActivity ?? 1;
  const initialSmoker = predictionData?.input_payload?.Smoker ?? 0;
  const initialFruits = predictionData?.input_payload?.Fruits ?? 1;
  const initialVeggies = predictionData?.input_payload?.Veggies ?? 1;

  const [simBmi, setSimBmi] = useState(Number(initialBmi));
  const [simPhys, setSimPhys] = useState(Number(initialPhys));
  const [simSmoker, setSimSmoker] = useState(Number(initialSmoker));
  const [simFruits, setSimFruits] = useState(Number(initialFruits));
  const [simVeggies, setSimVeggies] = useState(Number(initialVeggies));

  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [whatIfError, setWhatIfError] = useState(null);
  const [whatIfResults, setWhatIfResults] = useState(defaultWhatIfResults);

  const diseaseData = selectedDisease === 'diabetes'
    ? predictionData?.diabetes
    : predictionData?.heartDisease;

  const userFacingFactors = diseaseData?.userFacingFactors || [];
  const rawShapValues = diseaseData?.shapValues || {};
  const explainerType = diseaseData?.explainerType || (selectedDisease === 'diabetes' ? 'TreeExplainer (XGBoost)' : 'LinearExplainer (Logistic Regression)');

  // Separate into raising vs lowering factors
  const raisingFactors = userFacingFactors.filter((f) => f.direction === 'raises');
  const loweringFactors = userFacingFactors.filter((f) => f.direction === 'lowers');

  // Trigger What-If Simulation
  const handleRunWhatIf = async () => {
    setWhatIfLoading(true);
    setWhatIfError(null);
    try {
      const payload = {
        BMI: Number(simBmi),
        PhysActivity: Number(simPhys),
        Smoker: Number(simSmoker),
        Fruits: Number(simFruits),
        Veggies: Number(simVeggies),
      };
      const res = await simulateWhatIf(payload);
      setWhatIfResults(res);
    } catch (err) {
      console.error('What-if simulation failed:', err);
      setWhatIfError(err.response?.data?.detail || 'Failed to calculate scenario. Please check input ranges.');
    } finally {
      setWhatIfLoading(false);
    }
  };

  const handleResetWhatIf = () => {
    setSimBmi(Number(initialBmi));
    setSimPhys(Number(initialPhys));
    setSimSmoker(Number(initialSmoker));
    setSimFruits(Number(initialFruits));
    setSimVeggies(Number(initialVeggies));
    setWhatIfResults(null);
    setWhatIfError(null);
  };

  return (
    <div className="space-y-8">
      {/* SECTION HEADER */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-100 text-teal-800 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Factor Impact & Explainability</span>
            </div>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">
              Why your results look this way
            </h2>
          </div>

          {/* Technical Details Toggle */}
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="self-start sm:self-auto px-4 py-2 rounded-xl border border-slate-200 hover:border-slate-300 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Cpu className="w-4 h-4 text-slate-500" />
            <span>{showTechnicalDetails ? 'Hide technical details' : 'Show technical details'}</span>
          </button>
        </div>

        {/* How to Read This Line (Itemised-bill picture) */}
        <div className="p-4 bg-teal-50/70 border border-teal-200/80 rounded-2xl space-y-2">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-teal-950">
                <strong>How to read this:</strong> Think of your risk score like an itemised bill—some factors add to your score, while others subtract from it.
              </p>
              <button
                onClick={() => setShowHowToReadNote(!showHowToReadNote)}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 underline flex items-center gap-1 cursor-pointer"
              >
                <span>{showHowToReadNote ? 'Hide model explanation note' : 'How the model weighs answers (not proof of cause)'}</span>
                {showHowToReadNote ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {showHowToReadNote && (
            <div className="pt-2 pl-8 text-xs text-slate-600 leading-relaxed border-t border-teal-200/60 mt-2 space-y-1">
              <p>
                This breakdown reveals how our statistical machine learning algorithms weigh your individual answers against large population clinical datasets.
              </p>
              <p className="font-medium text-slate-700">
                ⚠️ <strong>Important:</strong> These factors explain how the mathematical algorithm reached your estimate. They are statistical contributors, <em>not proof of direct biological cause or an official medical diagnosis</em>.
              </p>
            </div>
          )}
        </div>

        {/* Disease Switcher Tabs */}
        <div className="flex items-center gap-3 pt-2 border-b border-slate-100 pb-3">
          <button
            onClick={() => setSelectedDisease('diabetes')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              selectedDisease === 'diabetes'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Type 2 Diabetes Breakdown</span>
          </button>
          <button
            onClick={() => setSelectedDisease('heart')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              selectedDisease === 'heart'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>Heart Disease Breakdown</span>
          </button>

          <span className="hidden sm:inline-block ml-auto text-[11px] text-slate-400 font-mono">
            Model: {explainerType}
          </span>
        </div>

        {/* FACTORS BREAKDOWN: RAISING VS LOWERING */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* GROUP 1: WHAT IS RAISING YOUR SCORE */}
          <div className="bg-rose-50/40 border border-rose-200/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-rose-200/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <TrendingUp className="w-4 h-4 text-rose-700" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-sm text-rose-950">
                    What is raising your score
                  </h3>
                  <span className="text-[11px] text-rose-700 font-medium">
                    Factors that push this risk higher
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                {raisingFactors.length} factor{raisingFactors.length === 1 ? '' : 's'}
              </span>
            </div>

            {raisingFactors.length > 0 ? (
              <div className="space-y-3">
                {raisingFactors.map((item) => (
                  <FactorCard key={item.featureKey} item={item} showTechnicalDetails={showTechnicalDetails} />
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 bg-white/70 rounded-xl border border-dashed border-rose-200">
                No major factors significantly pushing your score higher.
              </div>
            )}
          </div>

          {/* GROUP 2: WHAT IS LOWERING IT */}
          <div className="bg-emerald-50/40 border border-emerald-200/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <TrendingDown className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-sm text-emerald-950">
                    What is lowering it
                  </h3>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Protective habits that lower your risk
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                {loweringFactors.length} factor{loweringFactors.length === 1 ? '' : 's'}
              </span>
            </div>

            {loweringFactors.length > 0 ? (
              <div className="space-y-3">
                {loweringFactors.map((item) => (
                  <FactorCard key={item.featureKey} item={item} showTechnicalDetails={showTechnicalDetails} />
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 bg-white/70 rounded-xl border border-dashed border-emerald-200">
                No significant protective factors detected in the top tier.
              </div>
            )}
          </div>
        </div>

        {/* TECHNICAL DETAILS EXPANDER */}
        {showTechnicalDetails && (
          <div className="pt-4 border-t border-slate-200 mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-teal-600" />
                <span>Technical Model Explainer Data</span>
              </h4>
              <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
                Algorithm: {explainerType}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Shapley Additive exPlanations (SHAP) allocate credit among features based on cooperative game theory. Positive numbers indicate increased log-odds / margin toward high risk.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-2">
              {Object.entries(rawShapValues).map(([feat, val]) => (
                <div key={feat} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-700 truncate pr-2">{feat}</span>
                  <span className={`font-mono font-bold shrink-0 ${Number(val) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {Number(val) > 0 ? `+${Number(val).toFixed(4)}` : Number(val).toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* "WHAT IF?" INTERACTIVE SIMULATION PANEL */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-blue-950 text-white rounded-3xl p-6 sm:p-8 border border-slate-700 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-400/20 text-teal-300 border border-teal-400/30 rounded-full text-xs font-extrabold uppercase tracking-wider mb-2">
              <Sliders className="w-3.5 h-3.5 text-teal-300" />
              <span>Interactive Lifestyle Simulation</span>
            </div>
            <h3 className="font-heading text-2xl font-bold text-white">
              The "What if?" Playground
            </h3>
            <p className="text-xs sm:text-sm text-teal-200/90 font-medium mt-1">
              Test how modifying changeable daily habits could shift your predicted trajectory.
            </p>
          </div>

          {/* Mandatory "estimate, not a promise" badge */}
          <div className="self-start sm:self-auto px-3.5 py-1.5 bg-amber-400/10 border border-amber-400/30 rounded-xl text-amber-300 text-xs font-extrabold tracking-wide">
            ⚠️ An estimate, not a promise
          </div>
        </div>

        {/* Changeable Factor Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. BMI Slider */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">Body Mass Index (BMI)</label>
              <span className="px-2.5 py-0.5 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-md text-xs font-mono font-bold">
                {simBmi.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="15"
              max="50"
              step="0.5"
              value={simBmi}
              onChange={(e) => setSimBmi(parseFloat(e.target.value))}
              className="w-full accent-teal-400 cursor-pointer h-2 bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-medium">
              <span>Underweight (18.5)</span>
              <span>Normal (22.0)</span>
              <span>Overweight (28.0)</span>
              <span>Obese (35+)</span>
            </div>
          </div>

          {/* 2. Physical Activity Toggle */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
            <label className="text-xs font-bold text-slate-300">Regular Physical Activity</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSimPhys(1)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  simPhys === 1
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🏃 Active (30+ min)
              </button>
              <button
                onClick={() => setSimPhys(0)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  simPhys === 0
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🛋️ Inactive
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Past 30 days moderate exercise routine</p>
          </div>

          {/* 3. Tobacco Smoking Toggle */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
            <label className="text-xs font-bold text-slate-300">Tobacco Smoking Status</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSimSmoker(0)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  simSmoker === 0
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🚭 Non-Smoker
              </button>
              <button
                onClick={() => setSimSmoker(1)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  simSmoker === 1
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🚬 Smoker
              </button>
            </div>
            <p className="text-[10px] text-slate-400">History of ≥100 cigarettes in lifetime</p>
          </div>

          {/* 4. Daily Fruits Toggle */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
            <label className="text-xs font-bold text-slate-300">Daily Fruit Consumption</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSimFruits(1)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  simFruits === 1
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🍎 Daily (≥1x)
              </button>
              <button
                onClick={() => setSimFruits(0)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  simFruits === 0
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Infrequent
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Fresh whole fruit intake</p>
          </div>

          {/* 5. Daily Vegetables Toggle */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
            <label className="text-xs font-bold text-slate-300">Daily Vegetable Intake</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSimVeggies(1)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  simVeggies === 1
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                🥦 Daily (≥1x)
              </button>
              <button
                onClick={() => setSimVeggies(0)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  simVeggies === 0
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Infrequent
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Leafy greens and dietary vegetables</p>
          </div>

          {/* Action Trigger Box */}
          <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-slate-300">Run Recalculation</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Re-evaluates the trained predictive models using your modified inputs.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRunWhatIf}
                disabled={whatIfLoading}
                className="flex-1 py-2.5 px-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {whatIfLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Calculating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Run Simulation</span>
                  </>
                )}
              </button>
              <button
                onClick={handleResetWhatIf}
                className="py-2.5 px-3 bg-slate-750 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all cursor-pointer"
                title="Reset to baseline"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {whatIfError && (
          <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{whatIfError}</span>
          </div>
        )}

        {/* Simulation Output Card */}
        {whatIfResults && (
          <div className="bg-slate-800/90 border border-teal-500/30 rounded-2xl p-5 sm:p-6 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <h4 className="font-heading font-extrabold text-sm text-white">
                  Simulation Comparison Results
                </h4>
              </div>
              <span className="text-[11px] text-teal-300 font-semibold italic">
                "{whatIfResults.disclaimer}"
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Diabetes Comparison */}
              <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Type 2 Diabetes</span>
                  {whatIfResults.diabetes.riskCategoryChanged && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Category Shifted!
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">Baseline Risk</div>
                    <div className="text-base font-extrabold text-slate-200 mt-0.5">
                      {Math.round(whatIfResults.diabetes.originalProbability * 100)}%
                      <span className="text-xs font-normal text-slate-400 ml-1">({whatIfResults.diabetes.originalRiskLevel})</span>
                    </div>
                  </div>
                  <div className="text-xl text-slate-600 font-bold">→</div>
                  <div className="text-right">
                    <div className="text-[10px] text-teal-300 font-semibold">Simulated Risk</div>
                    <div className="text-base font-extrabold text-teal-300 mt-0.5">
                      {Math.round(whatIfResults.diabetes.newProbability * 100)}%
                      <span className="text-xs font-normal text-teal-200/80 ml-1">({whatIfResults.diabetes.newRiskLevel})</span>
                    </div>
                  </div>
                </div>

                {/* Delta Badge */}
                <div className="pt-2 border-t border-slate-800 text-xs flex items-center justify-between">
                  <span className="text-slate-400">Net Risk Difference:</span>
                  <span className={`font-mono font-bold ${
                    whatIfResults.diabetes.probabilityDelta < 0 ? 'text-emerald-400' : whatIfResults.diabetes.probabilityDelta > 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {whatIfResults.diabetes.probabilityDelta > 0 ? '+' : ''}
                    {(whatIfResults.diabetes.probabilityDelta * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Heart Disease Comparison */}
              <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Heart Disease</span>
                  {whatIfResults.heartDisease.riskCategoryChanged && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Category Shifted!
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">Baseline Risk</div>
                    <div className="text-base font-extrabold text-slate-200 mt-0.5">
                      {Math.round(whatIfResults.heartDisease.originalProbability * 100)}%
                      <span className="text-xs font-normal text-slate-400 ml-1">({whatIfResults.heartDisease.originalRiskLevel})</span>
                    </div>
                  </div>
                  <div className="text-xl text-slate-600 font-bold">→</div>
                  <div className="text-right">
                    <div className="text-[10px] text-teal-300 font-semibold">Simulated Risk</div>
                    <div className="text-base font-extrabold text-teal-300 mt-0.5">
                      {Math.round(whatIfResults.heartDisease.newProbability * 100)}%
                      <span className="text-xs font-normal text-teal-200/80 ml-1">({whatIfResults.heartDisease.newRiskLevel})</span>
                    </div>
                  </div>
                </div>

                {/* Delta Badge */}
                <div className="pt-2 border-t border-slate-800 text-xs flex items-center justify-between">
                  <span className="text-slate-400">Net Risk Difference:</span>
                  <span className={`font-mono font-bold ${
                    whatIfResults.heartDisease.probabilityDelta < 0 ? 'text-emerald-400' : whatIfResults.heartDisease.probabilityDelta > 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {whatIfResults.heartDisease.probabilityDelta > 0 ? '+' : ''}
                    {(whatIfResults.heartDisease.probabilityDelta * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==============================================================================
// INDIVIDUAL FACTOR CARD COMPONENT
// ==============================================================================
const FactorCard = ({ item, showTechnicalDetails }) => {
  const isRaising = item.direction === 'raises';
  const isFixed = item.changeability === 'fixed';

  // Strength Bar styling
  const strengthWidth = item.strength === 'Strong' ? 'w-full' : item.strength === 'Moderate' ? 'w-2/3' : 'w-1/3';
  const strengthColor = isRaising
    ? item.strength === 'Strong'
      ? 'bg-rose-600'
      : item.strength === 'Moderate'
      ? 'bg-amber-500'
      : 'bg-orange-400'
    : item.strength === 'Strong'
    ? 'bg-emerald-600'
    : item.strength === 'Moderate'
    ? 'bg-teal-500'
    : 'bg-teal-400';

  return (
    <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5 transition-all hover:border-slate-300">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold text-slate-900">
              {item.plainLabel}
            </span>

            {/* "Can't Change" Tag for Fixed Factors (e.g. Age, Sex, Prior Event) */}
            {isFixed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                <Lock className="w-2.5 h-2.5 text-slate-500" />
                <span>can't change</span>
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            Your reading: <strong className="text-slate-800">{item.userValue}</strong>
          </div>
        </div>

        {/* Direction Badge & Arrow (accessible, text + icon, not color alone) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${
              isRaising
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            {isRaising ? (
              <>
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                <span>Raises Risk</span>
              </>
            ) : (
              <>
                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                <span>Lowers Risk</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Relative Impact Strength Indicator */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-400 font-medium">Model Influence:</span>
          <span className={`font-extrabold ${isRaising ? 'text-rose-700' : 'text-emerald-700'}`}>
            {item.strength} Impact
          </span>
        </div>
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${strengthWidth} ${strengthColor}`} />
        </div>
      </div>

      {/* One-Line Note */}
      <p className="text-[11px] text-slate-600 leading-normal pt-1 border-t border-slate-100">
        {item.note}
      </p>

      {/* Technical SHAP value when toggled */}
      {showTechnicalDetails && item.rawShap !== undefined && (
        <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span>Raw SHAP contribution:</span>
          <span className={`font-bold ${item.rawShap > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {item.rawShap > 0 ? `+${item.rawShap}` : item.rawShap}
          </span>
        </div>
      )}
    </div>
  );
};

export default ExplainabilitySection;
