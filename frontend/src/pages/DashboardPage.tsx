import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, Heart, Activity as PulseIcon, Sparkles,
  MapPin, MessageSquare, Send, RefreshCw,
  FileText, User as UserIcon, Info
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [predictionData, setPredictionData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'shap' | 'recommendations' | 'chat' | 'specialists'>('overview');

  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string }>>([
    {
      sender: 'ai',
      text: `Hello ${user?.name || 'Alex'}! I'm riskLens AI. I've reviewed your latest screening report. How can I help you understand your factors today?`,
      time: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('risklens_latest_prediction');
    if (saved) {
      setPredictionData(JSON.parse(saved));
    } else {
      // Default mock fallback prediction
      setPredictionData({
        timestamp: new Date().toISOString(),
        userProfile: { age: 48, bmi: '26.8', glucose: '128', bpSystolic: '134', bpDiastolic: '86' },
        diabetes: {
          riskPercentage: 62,
          level: 'Moderate Risk',
          shapFactors: [
            { feature: 'Fasting Blood Glucose', value: '128 mg/dL', impact: '+24%', direction: 'up' },
            { feature: 'Body Mass Index (BMI)', value: '26.8 kg/m²', impact: '+18%', direction: 'up' },
            { feature: 'Age Factor', value: '48 years', impact: '+12%', direction: 'up' },
            { feature: 'Diabetes Pedigree Proxy', value: 'Positive', impact: '+8%', direction: 'up' },
            { feature: 'Systolic Blood Pressure', value: '134 mmHg', impact: '+2%', direction: 'neutral' },
          ]
        },
        heartDisease: {
          riskPercentage: 28,
          level: 'Low Risk',
          shapFactors: [
            { feature: 'Systolic Blood Pressure', value: '134 mmHg', impact: '+14%', direction: 'up' },
            { feature: 'Total Cholesterol', value: '215 mg/dL', impact: '+10%', direction: 'up' },
            { feature: 'Exercise Angina', value: 'Negative', impact: '-4%', direction: 'down' },
            { feature: 'Resting Heart Rate', value: '72 bpm', impact: '-2%', direction: 'down' },
          ]
        },
        healthScore: 78
      });
    }
  }, []);

  const trendData = [
    { month: 'Jan', diabetesRisk: 42, heartRisk: 22, healthScore: 82 },
    { month: 'Feb', diabetesRisk: 48, heartRisk: 24, healthScore: 80 },
    { month: 'Mar', diabetesRisk: 55, heartRisk: 26, healthScore: 77 },
    { month: 'Apr', diabetesRisk: 58, heartRisk: 27, healthScore: 76 },
    { month: 'May', diabetesRisk: predictionData?.diabetes?.riskPercentage || 62, heartRisk: predictionData?.heartDisease?.riskPercentage || 28, healthScore: predictionData?.healthScore || 78 },
  ];

  const handleSendMessage = (textToSend?: string) => {
    const message = textToSend || chatInput;
    if (!message.trim()) return;

    const userMsg = { sender: 'user' as const, text: message, time: 'Just now' };
    setChatMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setChatInput('');
    setIsTyping(true);

    setTimeout(() => {
      let replyText = "Your diabetes risk of 62% is primarily influenced by your fasting glucose (128 mg/dL) and BMI (26.8 kg/m²). This is an early screening insight, not a diagnosis.";
      if (message.toLowerCase().includes('heart') || message.toLowerCase().includes('bp')) {
        replyText = "Your heart risk remains relatively low at 28%. Keeping your blood pressure below 120/80 mmHg and maintaining moderate aerobic activity will protect your cardiovascular baseline.";
      } else if (message.toLowerCase().includes('diet') || message.toLowerCase().includes('eat')) {
        replyText = "Prioritizing complex carbohydrates, soluble fiber (oats, legumes), and reducing refined sugars will directly help stabilize fasting glucose levels.";
      }

      setChatMessages((prev) => [
        ...prev,
        { sender: 'ai', text: replyText, time: 'Just now' }
      ]);
      setIsTyping(false);
    }, 1000);
  };

  const specialists = [
    {
      name: 'Dr. Evelyn Vance, MD',
      specialty: 'Endocrinologist & Metabolic Health',
      hospital: 'Metro Medical Center',
      distance: '1.4 miles away',
      rating: '4.9 ★ (124 reviews)',
      phone: '+1 (555) 234-5678',
      address: '742 Healthcare Blvd, Suite 300'
    },
    {
      name: 'Dr. Marcus Thorne, FACC',
      specialty: 'Preventive Cardiologist',
      hospital: 'St. Jude Heart Institute',
      distance: '2.8 miles away',
      rating: '4.8 ★ (98 reviews)',
      phone: '+1 (555) 876-5432',
      address: '108 Cardiovascular Way'
    },
    {
      name: 'Dr. Sophia Ramirez',
      specialty: 'Internal Medicine Specialist',
      hospital: 'University Health Plaza',
      distance: '3.2 miles away',
      rating: '4.9 ★ (210 reviews)',
      phone: '+1 (555) 345-6789',
      address: '500 Academic Medical Dr'
    }
  ];

  if (!predictionData) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Header Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-teal-400 flex items-center justify-center font-bold">
              <Activity className="w-5 h-5 text-teal-400" />
            </div>
            <span className="font-heading font-extrabold text-xl tracking-tight text-slate-900">
              risk<span className="text-teal-600">Lens</span>
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/assessment')}
              className="px-4 py-2 bg-teal-50 border border-teal-200 rounded-xl text-teal-800 text-xs font-bold hover:bg-teal-100 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retake Assessment</span>
            </button>

            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                {user?.name?.charAt(0) || 'A'}
              </div>
              <span className="hidden sm:inline text-xs font-bold text-slate-800">{user?.name || 'Alex Morgan'}</span>
              <button
                onClick={logout}
                className="text-xs text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Top Banner Status */}
        <div className="mb-8 p-6 bg-gradient-to-r from-slate-900 via-blue-950 to-teal-900 text-white rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              ML Screening Pipeline Executed
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold">
              Health Screening Report for {user?.name || 'Alex Morgan'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Evaluated: Type 2 Diabetes (Pima Model) & Heart Disease (UCI Cleveland Model)
            </p>
          </div>

          <div className="flex items-center gap-4 relative z-10">
            <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Overall Health Score</div>
              <div className="text-3xl font-extrabold text-white mt-0.5">{predictionData.healthScore}<span className="text-xs text-teal-400">/100</span></div>
            </div>
          </div>
        </div>

        {/* Tab Selection Navigation */}
        <div className="flex border-b border-slate-200 mb-8 overflow-x-auto gap-2">
          {[
            { id: 'overview', label: 'Risk Overview', icon: Activity },
            { id: 'shap', label: 'SHAP Explainability', icon: Sparkles },
            { id: 'recommendations', label: 'Personalized Plan', icon: FileText },
            { id: 'chat', label: 'AI Health Chatbot', icon: MessageSquare },
            { id: 'specialists', label: 'Nearby Specialists', icon: MapPin },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'border-teal-600 text-teal-700 bg-white shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Risk Gauges Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Type 2 Diabetes Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-bold">
                      <PulseIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-heading font-extrabold text-lg text-slate-900">Type 2 Diabetes Risk</h3>
                      <span className="text-xs font-semibold text-slate-400">XGBoost ML Estimator</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                    {predictionData.diabetes.level}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-extrabold text-slate-900">{predictionData.diabetes.riskPercentage}%</span>
                  <span className="text-xs font-semibold text-slate-500">Estimated 5-Year Risk Probability</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-6">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-700"
                    style={{ width: `${predictionData.diabetes.riskPercentage}%` }}
                  ></div>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Key Factor Pushes (SHAP)</div>
                  {predictionData.diabetes.shapFactors.slice(0, 3).map((f: any) => (
                    <div key={f.feature} className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-600 font-medium">{f.feature} ({f.value})</span>
                      <span className="font-extrabold text-amber-600">{f.impact}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Heart Disease Card */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold">
                      <Heart className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-heading font-extrabold text-lg text-slate-900">Heart Disease Risk</h3>
                      <span className="text-xs font-semibold text-slate-400">UCI Cleveland ML Estimator</span>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                    {predictionData.heartDisease.level}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-extrabold text-slate-900">{predictionData.heartDisease.riskPercentage}%</span>
                  <span className="text-xs font-semibold text-slate-500">Estimated 5-Year Risk Probability</span>
                </div>

                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-6">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-700"
                    style={{ width: `${predictionData.heartDisease.riskPercentage}%` }}
                  ></div>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Key Factor Pushes (SHAP)</div>
                  {predictionData.heartDisease.shapFactors.slice(0, 3).map((f: any) => (
                    <div key={f.feature} className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-600 font-medium">{f.feature} ({f.value})</span>
                      <span className={`font-extrabold ${f.direction === 'down' ? 'text-emerald-600' : 'text-slate-700'}`}>{f.impact}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Shared Risk Factor Banner */}
            <div className="bg-gradient-to-r from-teal-500/10 via-blue-500/10 to-indigo-500/10 border border-teal-200 p-6 rounded-3xl flex items-start gap-4">
              <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-heading font-extrabold text-base text-slate-900">
                  Shared Risk Factor Insight
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                  Your screening reveals that factors such as <strong>BMI ({predictionData.userProfile.bmi})</strong> and <strong>Systolic Blood Pressure ({predictionData.userProfile.bpSystolic} mmHg)</strong> simultaneously contribute to both your Type 2 Diabetes and Heart Disease estimations. Targeting weight management and sodium intake will improve both risk profiles together.
                </p>
              </div>
            </div>

            {/* Health Risk Trends Line Chart */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
                <div>
                  <h3 className="font-heading font-extrabold text-lg text-slate-900">Risk Trajectory Over Time</h3>
                  <p className="text-xs text-slate-500">Historical prediction tracking (5 Months)</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Diabetes Risk
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Heart Risk
                  </span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="month" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px' }} />
                    <Line type="monotone" dataKey="diabetesRisk" stroke="#F59E0B" strokeWidth={3} dot={{ r: 5 }} />
                    <Line type="monotone" dataKey="heartRisk" stroke="#10B981" strokeWidth={3} dot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SHAP EXPLAINABILITY */}
        {activeTab === 'shap' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div>
              <span className="px-3 py-1 bg-teal-100 text-teal-800 rounded-full text-xs font-extrabold">
                SHAP Explainable AI
              </span>
              <h2 className="font-heading text-2xl font-bold text-slate-900 mt-2">
                Why was your Diabetes risk calculated at {predictionData.diabetes.riskPercentage}%?
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                SHAP (Shapley Additive exPlanations) breaks down exact feature weights so you know precisely what drives your result.
              </p>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
              {predictionData.diabetes.shapFactors.map((f: any) => (
                <div key={f.feature} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Clinical Parameter</span>
                    <span className="font-bold text-slate-900 text-base">{f.feature}</span>
                    <span className="text-xs text-slate-500 block font-semibold">User Data: {f.value}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 font-bold block">Risk Impact</span>
                      <span className="text-lg font-extrabold text-amber-600">{f.impact}</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                      ↑
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-900 text-white rounded-2xl text-xs space-y-1">
              <span className="font-bold text-teal-400 block">Explainability Guarantee</span>
              <p className="text-slate-300">
                Unlike opaque black-box neural networks, riskLens uses tree-based SHAP values to guarantee transparency for every patient assessment.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: PERSONALIZED PLAN */}
        {activeTab === 'recommendations' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Personalized Prevention Plan</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  AI-generated guidelines grounded in your clinical SHAP indicators.
                </p>
              </div>
              <span className="hidden sm:inline-flex px-3 py-1 bg-teal-50 border border-teal-200 text-teal-700 rounded-full text-xs font-extrabold">
                ✨ AI-Generated • Personalized
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  🥗
                </div>
                <h3 className="font-heading font-bold text-lg text-slate-900">Nutrition Protocol</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Focus on high-fiber foods to buffer glucose absorption (target 30g/day). Swap refined carbohydrates for whole grains and legumes to reduce postprandial glucose spikes.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  🏃
                </div>
                <h3 className="font-heading font-bold text-lg text-slate-900">Movement Guidelines</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Engage in 150 minutes of moderate aerobic exercise per week (e.g. brisk walking 30 min/day). Physical activity increases insulin sensitivity independent of weight loss.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  😴
                </div>
                <h3 className="font-heading font-bold text-lg text-slate-900">Sleep & Stress Management</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Target 7-8 hours of uninterrupted sleep. Elevated stress hormones (cortisol) mobilize glucose reserves and increase blood pressure.
                </p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  ⚡
                </div>
                <h3 className="font-heading font-bold text-lg text-slate-900">Priority Next Step</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Schedule a routine Fasting Plasma Glucose test with a primary care physician to verify your baseline within 60 days.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CHATBOT */}
        {activeTab === 'chat' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[550px]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500 text-slate-900 flex items-center justify-center font-bold">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm">riskLens AI Health Assistant</h3>
                  <p className="text-[10px] text-teal-300">Grounded in your latest assessment parameters</p>
                </div>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
                Screening Support Only
              </span>
            </div>

            {/* Chat History */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-teal-600 text-white rounded-br-none shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-xs'
                    }`}
                  >
                    <p>{msg.text}</p>
                    <span className="text-[9px] opacity-60 mt-1 block text-right">{msg.time}</span>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl px-4 py-3 text-xs animate-pulse">
                    riskLens AI is analyzing your query...
                  </div>
                </div>
              )}
            </div>

            {/* Quick Sample Prompts */}
            <div className="p-2.5 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto">
              {[
                "Why is my diabetes risk higher?",
                "How does BMI affect heart health?",
                "What foods should I avoid?"
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => handleSendMessage(p)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Chat Input */}
            <div className="p-3 bg-white border-t border-slate-200 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask follow-up questions about your screening report..."
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <button
                onClick={() => handleSendMessage()}
                className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: SPECIALISTS */}
        {activeTab === 'specialists' && (
          <div className="space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-bold text-slate-900">Nearby Healthcare Specialists</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Discover qualified local medical providers based on your elevated risk factors.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {specialists.map((doc, idx) => (
                <div key={idx} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                      <UserIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-heading font-extrabold text-base text-slate-900">{doc.name}</h3>
                      <span className="text-xs text-teal-700 font-bold block">{doc.specialty}</span>
                      <span className="text-xs text-slate-400 block mt-0.5">{doc.hospital}</span>
                    </div>

                    <div className="pt-2 text-xs text-slate-600 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{doc.distance}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-bold text-amber-600">
                        <span>{doc.rating}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => alert(`Appointment request sent for ${doc.name}. A clinic representative will contact you.`)}
                    className="mt-6 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Request Consultation
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>riskLens provides specialist recommendations for convenience. We do not receive referral fees or endorse specific providers.</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
