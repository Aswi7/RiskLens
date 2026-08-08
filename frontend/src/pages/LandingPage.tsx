import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ArrowRight, ShieldCheck, Sparkles, FileText, MessageSquare, ChevronDown, ChevronUp
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Accordion State for FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Chat Demo Content
  const demoChatQuestion = "Why is my diabetes risk higher?";
  const demoChatAnswer =
    "Your result is influenced mainly by glucose, BMI, age, and family-history-related factors. These are contributing factors to your screening result, not a clinical diagnosis.";

  const handleStartAssessment = () => {
    if (isAuthenticated) {
      navigate('/assessment');
    } else {
      navigate('/login?redirect=/assessment');
    }
  };

  const trendData = [
    { month: 'Jan', diabetes: 42, heart: 22 },
    { month: 'Feb', diabetes: 48, heart: 24 },
    { month: 'Mar', diabetes: 55, heart: 26 },
    { month: 'Apr', diabetes: 58, heart: 27 },
    { month: 'May', diabetes: 62, heart: 28 },
  ];

  const faqs = [
    {
      q: "Does riskLens diagnose medical conditions?",
      a: "No. riskLens is an early-warning health screening and decision-support tool, not a clinical diagnostic system. It estimates risk probabilities based on validated machine learning models and highlights contributing factors to share with a physician."
    },
    {
      q: "How does Explainable AI (SHAP) work in riskLens?",
      a: "SHAP (Shapley Additive exPlanations) calculates the exact numeric impact each feature (like glucose level or BMI) contributes to your final score. Unlike black-box algorithms, you can see why your risk score went up or down."
    },
    {
      q: "Which disease risk models are included?",
      a: "riskLens currently features two machine learning models: Type 2 Diabetes (trained on clinical metabolic indicators) and Heart Disease (trained on cardiovascular vitals and symptom proxies)."
    },
    {
      q: "Is my personal health data private and safe?",
      a: "Yes. All data transmitted through riskLens is encrypted with bank-level 256-bit TLS/SSL encryption and never sold or shared with third-party advertisers."
    },
    {
      q: "What should I do if my risk score is moderate or high?",
      a: "If your assessment indicates elevated risk, we recommend utilizing our Specialist Finder to schedule a follow-up consultation with a primary care physician or specialist for diagnostic testing."
    },
    {
      q: "Can I use riskLens if I don't know all my blood lab values?",
      a: "Yes! riskLens supports optional lab uploads and flexible input parameters, allowing you to get an estimated health score using baseline physical markers and symptoms."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-teal-500/20 selection:text-teal-900 overflow-x-hidden">
      {/* Sticky Navbar */}
      <Navbar />

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 bg-hero-glow overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Hero Left Content */}
            <div className="lg:col-span-6 space-y-6 text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-extrabold tracking-wide shadow-2xs">
                <Sparkles className="w-4 h-4 text-teal-600 animate-pulse" />
                <span>AI-Powered Early Health Screening</span>
              </div>

              {/* Large Headline */}
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
                Understand Your Health. <span className="text-gradient-teal">Act Early.</span>
              </h1>

              {/* Supporting Text */}
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
                Discover your risk for <strong>Type 2 Diabetes</strong> and <strong>Heart Disease</strong> with explainable machine learning, personalized insights, and actionable prevention guidance.
              </p>

              {/* CTA Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <button
                  onClick={handleStartAssessment}
                  className="px-7 py-4 text-base font-bold text-white bg-gradient-to-r from-slate-900 via-blue-950 to-teal-700 hover:from-slate-800 hover:to-teal-600 rounded-2xl shadow-xl shadow-teal-900/20 hover:shadow-teal-900/30 transition-all duration-300 transform hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <Sparkles className="w-5 h-5 text-teal-300 group-hover:rotate-12 transition-transform" />
                  <span>Start Free Health Assessment</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>

                <a
                  href="#how-it-works"
                  className="px-6 py-4 text-base font-semibold text-slate-700 bg-white hover:bg-slate-100/80 border border-slate-200 rounded-2xl shadow-xs transition-all text-center"
                >
                  See How It Works
                </a>
              </div>

              {/* Disclaimer Note */}
              <div className="pt-1 flex items-center gap-2 text-xs text-slate-500 font-medium">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Screening support, not a medical diagnosis.</span>
              </div>
            </div>

            {/* Hero Right Visual Dashboard Mockup */}
            <div className="lg:col-span-6 relative">
              {/* Background Glow */}
              <div className="absolute -inset-4 bg-gradient-to-tr from-teal-400/20 to-blue-600/20 rounded-3xl blur-2xl -z-10 animate-pulse-slow"></div>

              {/* Dashboard Card Container */}
              <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-slate-900/10 space-y-5 animate-float">
                {/* Dashboard Top Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-heading font-extrabold text-sm text-slate-900">Health Risk Dashboard</h4>
                      <span className="text-[11px] text-slate-400 font-medium">Live Machine Learning Evaluation</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full text-xs font-bold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Active Screening
                  </span>
                </div>

                {/* Overall Health Score & Disease Risk Gauges */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    <div className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Health Score</div>
                    <div className="text-2xl font-extrabold text-slate-900 mt-1">78<span className="text-xs text-teal-600">/100</span></div>
                    <div className="text-[10px] font-bold text-emerald-600 mt-0.5">Good Standing</div>
                  </div>

                  <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-100">
                    <div className="text-[10px] uppercase font-extrabold text-amber-700 tracking-wider">Diabetes Risk</div>
                    <div className="text-2xl font-extrabold text-amber-900 mt-1">62%</div>
                    <div className="text-[10px] font-bold text-amber-700 mt-0.5">Moderate Risk</div>
                  </div>

                  <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-100">
                    <div className="text-[10px] uppercase font-extrabold text-emerald-700 tracking-wider">Heart Risk</div>
                    <div className="text-2xl font-extrabold text-emerald-900 mt-1">28%</div>
                    <div className="text-[10px] font-bold text-emerald-700 mt-0.5">Low Risk</div>
                  </div>
                </div>

                {/* Health Vitals Strip */}
                <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold text-slate-600 pt-1">
                  <div className="bg-slate-100/80 px-2.5 py-1.5 rounded-xl text-center">BMI: <strong className="text-slate-900">26.8</strong></div>
                  <div className="bg-slate-100/80 px-2.5 py-1.5 rounded-xl text-center">Glucose: <strong className="text-slate-900">128 mg/dL</strong></div>
                  <div className="bg-slate-100/80 px-2.5 py-1.5 rounded-xl text-center">BP: <strong className="text-slate-900">134/86</strong></div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* TRUST / VALUE STRIP */}
      <section className="py-10 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-3.5 p-3">
              <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                <Activity className="w-5.5 h-5.5" />
              </div>
              <div>
                <h4 className="font-heading font-extrabold text-sm text-slate-900">2 Conditions</h4>
                <p className="text-xs text-slate-500">Diabetes + Heart Disease</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 p-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5.5 h-5.5" />
              </div>
              <div>
                <h4 className="font-heading font-extrabold text-sm text-slate-900">Explainable AI</h4>
                <p className="text-xs text-slate-500">Know why your risk changed</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 p-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
                <FileText className="w-5.5 h-5.5" />
              </div>
              <div>
                <h4 className="font-heading font-extrabold text-sm text-slate-900">Personalized Insights</h4>
                <p className="text-xs text-slate-500">Based on your actual data</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 p-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5.5 h-5.5" />
              </div>
              <div>
                <h4 className="font-heading font-extrabold text-sm text-slate-900">Early Detection Focus</h4>
                <p className="text-xs text-slate-500">Act before issues escalate</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM / COMPARISON SECTION */}
      <section id="why-risklens" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-extrabold tracking-wide uppercase">
              The Healthcare Gap
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
              Health risks often go unnoticed until it's too late.
            </h2>
            <p className="text-base text-slate-600 mt-3 leading-relaxed">
              Chronic conditions develop gradually over years. Most generic online calculators return a static, unexplained percentage without showing what caused it or providing actionable next steps.
            </p>
          </div>

          {/* Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {/* Traditional Calculators Card */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                  ✕
                </div>
                <h3 className="font-heading text-xl font-bold text-slate-900">Traditional Risk Calculators</h3>
              </div>

              <ul className="space-y-4">
                {[
                  "Generic scores with no explanation of underlying logic",
                  "Limited or zero transparency on contributing clinical parameters",
                  "Static template recommendations non-customized to user profile",
                  "Single one-time snapshot with no trend history over time"
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-slate-600">
                    <span className="w-5 h-5 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-xs shrink-0 mt-0.5">✕</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* riskLens Card */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-teal-950 text-white rounded-3xl p-8 border border-teal-500/30 shadow-xl relative space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500 text-slate-900 flex items-center justify-center font-bold">
                  <Activity className="w-5 h-5" />
                </div>
                <h3 className="font-heading text-xl font-bold text-white">riskLens Health AI</h3>
              </div>

              <ul className="space-y-4">
                {[
                  "Multi-disease screening (Diabetes & Heart Disease models)",
                  "Explainable SHAP feature importance showing WHY a score was calculated",
                  "AI-generated personalized recommendations tailored to your vitals",
                  "Risk trend tracking over time to monitor trajectory",
                  "Direct connection to relevant nearby medical specialists"
                ].map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-slate-200 font-medium">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center text-xs shrink-0 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-24 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="px-3 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-full text-xs font-extrabold uppercase">
              5-Step Workflow
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
              From your health data to meaningful insights.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { num: '01', title: 'Tell Us About You', desc: 'Basic profile, lifestyle parameters, medical and family history.' },
              { num: '02', title: 'Add Your Vitals', desc: 'Blood pressure, glucose levels, cholesterol, and symptoms.' },
              { num: '03', title: 'AI Risk Screening', desc: 'Dual XGBoost estimators calculate disease probabilities.' },
              { num: '04', title: 'Understand Results', desc: 'SHAP explainability highlights exact contributing factors.' },
              { num: '05', title: 'Actionable Steps', desc: 'Personalized prevention plans and nearby specialist access.' },
            ].map((step, idx) => (
              <div key={idx} className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 hover:border-teal-400 transition-all flex flex-col justify-between group">
                <div>
                  <span className="font-heading font-extrabold text-2xl text-teal-600 group-hover:text-teal-700">{step.num}</span>
                  <h4 className="font-heading font-bold text-slate-900 text-base mt-2">{step.title}</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CORE DIFFERENTIATOR SECTION (SHAP EXPLAINABILITY) */}
      <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-5 space-y-6">
              <span className="px-3 py-1 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full text-xs font-bold uppercase">
                Explainable AI with SHAP
              </span>
              <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Not just a prediction. <span className="text-teal-400">An explanation.</span>
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Most risk calculators tell you WHAT your risk is. <strong>riskLens helps explain WHY.</strong>
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                By implementing Shapley Additive exPlanations (SHAP), every user receives a transparent breakdown of exact clinical factor contributions.
              </p>
            </div>

            <div className="lg:col-span-7 bg-slate-950 p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h4 className="font-heading font-extrabold text-lg text-white">Diabetes Risk Factor Attribution</h4>
                  <span className="text-xs text-slate-400">SHAP Local Feature Importance</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-amber-400">62%</span>
                  <span className="text-[10px] text-slate-400 block">Moderate Risk</span>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  { name: 'Fasting Glucose (128 mg/dL)', impact: '+24%', width: '80%', dir: 'up' },
                  { name: 'Body Mass Index (26.8 kg/m²)', impact: '+18%', width: '60%', dir: 'up' },
                  { name: 'Age Factor (48 yrs)', impact: '+12%', width: '40%', dir: 'up' },
                  { name: 'Family History Proxy', impact: '+8%', width: '25%', dir: 'up' },
                  { name: 'Blood Pressure (134/86)', impact: '+2%', width: '10%', dir: 'neutral' },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">{item.name}</span>
                      <span className="font-bold text-amber-400">{item.impact}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: item.width }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* HEALTH INSIGHTS & SCORE SECTION */}
      <section id="health-insights" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="px-3 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-full text-xs font-extrabold uppercase">
              Health Score Assessment
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
              One simple score. A clearer picture of your health.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-5 bg-slate-50 rounded-3xl p-8 border border-slate-200 text-center space-y-4">
              <div className="relative inline-flex items-center justify-center w-36 h-36 rounded-full bg-gradient-to-tr from-teal-500 via-blue-600 to-indigo-600 p-3 shadow-xl">
                <div className="w-full h-full bg-white rounded-full flex flex-col items-center justify-center">
                  <span className="text-4xl font-extrabold text-slate-900">78</span>
                  <span className="text-xs text-slate-400 font-bold">OUT OF 100</span>
                </div>
              </div>
              <h3 className="font-heading font-extrabold text-xl text-slate-900">Overall Baseline Health Score</h3>
              <p className="text-xs text-slate-500">Instant snapshot calculated prior to disease-specific ML prediction.</p>
            </div>

            <div className="md:col-span-7 space-y-4">
              {[
                { cat: 'Lifestyle', score: '82/100', color: 'bg-emerald-500' },
                { cat: 'Fitness Activity', score: '70/100', color: 'bg-blue-500' },
                { cat: 'Nutrition Quality', score: '75/100', color: 'bg-teal-500' },
                { cat: 'Sleep Duration', score: '85/100', color: 'bg-indigo-500' },
                { cat: 'Stress Resilience', score: '74/100', color: 'bg-amber-500' },
              ].map((item, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <span className="font-semibold text-slate-800 text-sm">{item.cat}</span>
                  <span className="font-extrabold text-slate-900 text-sm">{item.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* EARLY DETECTION / TREND SECTION */}
      <section className="py-24 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-3xl mx-auto">
            <span className="px-3 py-1 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full text-xs font-extrabold uppercase">
              Early Detection Focus
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-3">
              Track your health. See the direction.
            </h2>
            <p className="text-sm text-slate-300 mt-2">
              riskLens is designed around early-stage awareness — helping you notice changes over time rather than relying on a single snapshot.
            </p>
          </div>

          <div className="bg-slate-950 p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-heading font-extrabold text-lg text-white">5-Month Disease Risk Trajectory</h3>
                <span className="text-xs text-slate-400">Repeated assessment tracking</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Diabetes Risk
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Heart Disease Risk
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                  <YAxis stroke="#64748B" fontSize={12} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                  <Line type="monotone" dataKey="diabetes" stroke="#F59E0B" strokeWidth={3} dot={{ r: 5 }} />
                  <Line type="monotone" dataKey="heart" stroke="#10B981" strokeWidth={3} dot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* AI CHATBOT PREVIEW SECTION */}
      <section className="py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-5 space-y-6">
              <span className="px-3 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-full text-xs font-extrabold uppercase">
                Context-Aware Assistant
              </span>
              <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Have questions about your results? <span className="text-teal-600">Ask riskLens.</span>
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Ask follow-up questions contextualized to your own screening report in natural language.
              </p>
            </div>

            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-teal-400" />
                <span className="font-bold text-sm">riskLens AI Health Conversation</span>
              </div>

              <div className="p-6 space-y-4 bg-slate-50/50">
                <div className="flex justify-end">
                  <div className="bg-teal-600 text-white rounded-2xl rounded-br-none px-4 py-3 text-xs">
                    {demoChatQuestion}
                  </div>
                </div>

                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-none px-4 py-3 text-xs leading-relaxed shadow-2xs">
                    {demoChatAnswer}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section id="features" className="py-24 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="px-3 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-full text-xs font-extrabold uppercase">
              Full Feature Suite
            </span>
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
              Everything you need to understand your health.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Explainable AI', desc: 'SHAP factor contribution breakdown per feature.' },
              { title: 'Diabetes Screening', desc: 'XGBoost model trained on Pima Indian Diabetes dataset.' },
              { title: 'Heart Disease Screening', desc: 'XGBoost model trained on UCI Cleveland dataset.' },
              { title: 'Personalized Recommendations', desc: 'LLM-generated protocols based on vitals.' },
              { title: 'Health Score', desc: 'Instant baseline score prior to ML prediction.' },
              { title: 'Risk Trend Tracking', desc: '5-month trajectory monitoring over time.' },
              { title: 'AI Health Chatbot', desc: 'Context-aware Q&A grounded in user report.' },
              { title: 'Specialist Finder', desc: 'Nearby cardiologist and diabetologist recommendations.' },
            ].map((f, idx) => (
              <div key={idx} className="p-6 bg-slate-50 rounded-2xl border border-slate-200/80 hover:border-teal-400 transition-all">
                <h4 className="font-heading font-extrabold text-slate-900 text-base mb-1">{f.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="px-3 py-1 bg-teal-50 text-teal-800 border border-teal-200 rounded-full text-xs font-extrabold uppercase">
              Got Questions?
            </span>
            <h2 className="font-heading text-3xl font-extrabold text-slate-900 tracking-tight mt-3">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full p-5 text-left font-bold text-slate-900 text-sm flex items-center justify-between cursor-pointer"
                >
                  <span>{faq.q}</span>
                  {openFaq === idx ? <ChevronUp className="w-4 h-4 text-teal-600" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-5 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA BANNER */}
      <section className="py-20 bg-gradient-to-r from-slate-900 via-blue-950 to-teal-900 text-white text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-6">
          <h2 className="font-heading text-3xl sm:text-5xl font-extrabold tracking-tight">
            Your health deserves more than a guess.
          </h2>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto">
            Understand your risks. Discover what influences them. Take your next step with riskLens.
          </p>

          <button
            onClick={handleStartAssessment}
            className="px-8 py-4 bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-base rounded-2xl shadow-xl transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Sparkles className="w-5 h-5 text-slate-950" />
            <span>Start Your Free Health Assessment</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="text-xs text-teal-300 font-semibold tracking-wider uppercase">
            Free • Personalized • Explainable
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-slate-400 py-12 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-500 text-slate-950 flex items-center justify-center font-bold">
                <Activity className="w-4 h-4" />
              </div>
              <span className="font-heading font-extrabold text-lg text-white">risk<span className="text-teal-400">Lens</span></span>
            </div>

            <div className="flex flex-wrap gap-6 text-slate-300 font-medium">
              <a href="#how-it-works" className="hover:text-white">How It Works</a>
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#why-risklens" className="hover:text-white">Why riskLens</a>
              <a href="#health-insights" className="hover:text-white">Health Insights</a>
              <a href="#faq" className="hover:text-white">FAQ</a>
            </div>
          </div>

          <div className="border-t border-slate-900 pt-6 text-center text-slate-500 space-y-2">
            <p>
              riskLens is not a diagnostic tool. Always consult a qualified healthcare professional for medical advice.
            </p>
            <p>© {new Date().getFullYear()} riskLens AI Platform. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
