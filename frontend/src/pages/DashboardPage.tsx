import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, Heart, Activity as PulseIcon, Sparkles,
  MapPin, MessageSquare, Send, RefreshCw,
  FileText, User as UserIcon, Info, AlertTriangle, CheckSquare, Square, Stethoscope, ArrowRight
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

interface StructuredRecommendations {
  diet: string[];
  exercise: string[];
  sleep: string;
  urgency: 'low' | 'moderate' | 'high';
  sharedRiskFactors?: string[];
  disclaimer: string;
}

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [predictionData, setPredictionData] = useState<any>(null);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'shap' | 'recommendations' | 'chat' | 'specialists'>('overview');

  // Recommendations State
  const [recommendations, setRecommendations] = useState<StructuredRecommendations | null>(null);
  const [recLoading, setRecLoading] = useState<boolean>(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<{ [key: string]: boolean }>({});

  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; time: string; isEmergency?: boolean; skippedLLM?: boolean }>>([
    {
      sender: 'ai',
      text: `Hello ${user?.name || 'there'}! I'm riskLens AI Health Assistant. How can I assist you with your health indicators today?`,
      time: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Fetch prediction history from backend for the logged-in user
  useEffect(() => {
    const fetchUserHistory = async () => {
      setLoadingHistory(true);
      try {
        const historyRes = await api.get('/history');
        if (historyRes.data && historyRes.data.length > 0) {
          setHistoryRecords(historyRes.data);
          const latest = historyRes.data[0];
          setPredictionData({
            id: latest.id,
            timestamp: latest.timestamp,
            results: latest.results,
            input_payload: latest.input_payload,
            diabetes: latest.results?.diabetes,
            heartDisease: latest.results?.heartDisease
          });
          fetchRecommendations(latest.id);
          setLoadingHistory(false);
          return;
        }
      } catch (err) {
        console.warn('Could not fetch prediction history from backend:', err);
      }

      // Check localStorage for recently submitted assessment
      const saved = localStorage.getItem('risklens_latest_prediction');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setPredictionData(parsed);
          fetchRecommendations();
        } catch (e) {
          setPredictionData(null);
        }
      } else {
        setPredictionData(null);
      }
      setLoadingHistory(false);
    };

    fetchUserHistory();
  }, []);

  const fetchRecommendations = async (predictionId?: string) => {
    setRecLoading(true);
    setRecError(null);
    try {
      const res = await api.post('/recommendations', {
        prediction_id: predictionId || predictionData?.id
      });
      setRecommendations(res.data);
    } catch (err: any) {
      console.error('Error fetching recommendations:', err);
      setRecError('Failed to load personalized recommendations.');
    } finally {
      setRecLoading(false);
    }
  };

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSendMessage = async (textToSend?: string) => {
    const message = textToSend || chatInput;
    if (!message.trim()) return;

    const userMsg = { sender: 'user' as const, text: message, time: 'Just now' };
    setChatMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setChatInput('');
    setIsTyping(true);

    try {
      const historyPayload = chatMessages
        .filter((m) => m.text)
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }));

      const res = await api.post('/chat', {
        message,
        history: historyPayload,
        context: predictionData?.results || predictionData
      });

      const replyData = res.data;
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: replyData.reply,
          time: 'Just now',
          isEmergency: replyData.isEmergency,
          skippedLLM: replyData.skippedLLM
        }
      ]);
    } catch (err) {
      console.error('Error in chat API:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'I encountered an issue connecting to the health assistant. Please try asking your question again.',
          time: 'Just now'
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Process historical trend data from user's actual prediction history
  const trendData = historyRecords.length > 0
    ? historyRecords
        .slice()
        .reverse()
        .map((record, index) => ({
          month: `Eval ${index + 1}`,
          diabetesRisk: Math.round((record.results?.diabetes?.risk?.probability || 0) * 100),
          heartRisk: Math.round((record.results?.heartDisease?.risk?.probability || 0) * 100)
        }))
    : [
        {
          month: 'Current',
          diabetesRisk: Math.round((predictionData?.diabetes?.risk?.probability || 0) * 100),
          heartRisk: Math.round((predictionData?.heartDisease?.risk?.probability || 0) * 100)
        }
      ];

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

  const diabetesRiskPct = Math.round((predictionData?.diabetes?.risk?.probability || 0) * 100);
  const heartRiskPct = Math.round((predictionData?.heartDisease?.risk?.probability || 0) * 100);

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
              <span>Take Assessment</span>
            </button>

            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <span className="hidden sm:inline text-xs font-bold text-slate-800">{user?.name || user?.email || 'User'}</span>
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
        {loadingHistory ? (
          <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <Activity className="w-10 h-10 text-teal-600 mx-auto animate-spin" />
            <p className="text-sm font-semibold text-slate-600">Loading user health records from backend...</p>
          </div>
        ) : !predictionData ? (
          /* Empty State when logged in user has no predictions yet */
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm max-w-2xl mx-auto space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-teal-100 text-teal-700 flex items-center justify-center mx-auto font-bold">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h2 className="font-heading text-2xl font-bold text-slate-900">Welcome to RiskLens, {user?.name || 'User'}!</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
                You don't have any health risk assessment records yet. Take your first 10-step health assessment to calculate your Type 2 Diabetes and Heart Disease risk scores, view local SHAP drivers, and receive personalized AI advice.
              </p>
            </div>
            <button
              onClick={() => navigate('/assessment')}
              className="px-6 py-3 bg-gradient-to-r from-slate-900 via-blue-900 to-teal-700 text-white font-bold text-xs rounded-xl shadow-lg hover:shadow-teal-900/20 transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Start Health Assessment</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Top Banner Status */}
            <div className="mb-8 p-6 bg-gradient-to-r from-slate-900 via-blue-950 to-teal-900 text-white rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl"></div>
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full text-xs font-semibold mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Multi-Model AI Screening Pipeline
                </div>
                <h1 className="font-heading text-2xl sm:text-3xl font-extrabold">
                  Health Report for {user?.name || user?.email || 'User'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Evaluated: Type 2 Diabetes (XGBoost) & Heart Disease (Logistic Regression with StandardScaler)
                </p>
              </div>

              <div className="flex items-center gap-4 relative z-10">
                <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Diabetes Risk</div>
                  <div className="text-2xl font-extrabold text-amber-400 mt-0.5">{diabetesRiskPct}%</div>
                </div>
                <div className="bg-white/10 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 text-center">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Heart Risk</div>
                  <div className="text-2xl font-extrabold text-red-400 mt-0.5">{heartRiskPct}%</div>
                </div>
              </div>
            </div>

            {/* Tab Selection Navigation */}
            <div className="flex border-b border-slate-200 mb-8 overflow-x-auto gap-2">
              {[
                { id: 'overview', label: 'Risk Overview', icon: Activity },
                { id: 'shap', label: 'SHAP Explainability', icon: Sparkles },
                { id: 'recommendations', label: 'Personalized Checklist', icon: FileText },
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Type 2 Diabetes Card */}
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
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
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${predictionData.diabetes?.risk?.isHighRisk ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {predictionData.diabetes?.risk?.riskLevel || 'Evaluated'}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-4xl font-extrabold text-slate-900">{diabetesRiskPct}%</span>
                      <span className="text-xs font-semibold text-slate-500">Decision Cutoff Threshold: 40.0%</span>
                    </div>

                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-6">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(diabetesRiskPct, 100)}%` }}
                      ></div>
                    </div>

                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Top Positive SHAP Drivers</div>
                      {predictionData.diabetes?.shapValues &&
                        Object.entries(predictionData.diabetes.shapValues)
                          .slice(0, 3)
                          .map(([feat, val]: [string, any]) => (
                            <div key={feat} className="flex items-center justify-between text-xs py-1">
                              <span className="text-slate-600 font-medium">{feat}</span>
                              <span className="font-extrabold text-amber-600">+{Number(val).toFixed(4)}</span>
                            </div>
                          ))}
                    </div>
                  </div>

                  {/* Heart Disease Card */}
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center font-bold">
                          <Heart className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-heading font-extrabold text-lg text-slate-900">Heart Disease Risk</h3>
                          <span className="text-xs font-semibold text-slate-400">Logistic Regression (Scaled)</span>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${predictionData.heartDisease?.risk?.isHighRisk ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {predictionData.heartDisease?.risk?.riskLevel || 'Evaluated'}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-4xl font-extrabold text-slate-900">{heartRiskPct}%</span>
                      <span className="text-xs font-semibold text-slate-500">Decision Cutoff Threshold: 50.0%</span>
                    </div>

                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-6">
                      <div
                        className="bg-red-500 h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(heartRiskPct, 100)}%` }}
                      ></div>
                    </div>

                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      <div className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">Top Positive SHAP Drivers</div>
                      {predictionData.heartDisease?.shapValues &&
                        Object.entries(predictionData.heartDisease.shapValues)
                          .slice(0, 3)
                          .map(([feat, val]: [string, any]) => (
                            <div key={feat} className="flex items-center justify-between text-xs py-1">
                              <span className="text-slate-600 font-medium">{feat}</span>
                              <span className="font-extrabold text-red-600">+{Number(val).toFixed(4)}</span>
                            </div>
                          ))}
                    </div>
                  </div>
                </div>

                {/* Health Risk Trends Line Chart */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
                    <div>
                      <h3 className="font-heading font-extrabold text-lg text-slate-900">Risk Trajectory Over Time</h3>
                      <p className="text-xs text-slate-500">Historical prediction tracking ({trendData.length} evaluations)</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-amber-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Diabetes Risk
                      </span>
                      <span className="flex items-center gap-1.5 text-red-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Heart Risk
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
                        <Line type="monotone" dataKey="heartRisk" stroke="#EF4444" strokeWidth={3} dot={{ r: 5 }} />
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
                    SHAP Explainable AI Breakdown
                  </span>
                  <h2 className="font-heading text-2xl font-bold text-slate-900 mt-2">
                    What factors drive your statistical risk scores?
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    SHAP (Shapley Additive exPlanations) calculates feature weight contributions for each model independently.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  {/* Diabetes SHAP */}
                  <div className="space-y-3">
                    <h3 className="font-heading font-bold text-base text-slate-900 border-b pb-2">
                      Diabetes (TreeExplainer)
                    </h3>
                    {predictionData.diabetes?.shapValues ? (
                      Object.entries(predictionData.diabetes.shapValues).map(([feat, val]: [string, any]) => (
                        <div key={feat} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{feat}</span>
                          <span className={`font-extrabold ${Number(val) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {Number(val) > 0 ? `+${Number(val).toFixed(4)}` : Number(val).toFixed(4)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">No SHAP output available</p>
                    )}
                  </div>

                  {/* Heart Disease SHAP */}
                  <div className="space-y-3">
                    <h3 className="font-heading font-bold text-base text-slate-900 border-b pb-2">
                      Heart Disease (LinearExplainer)
                    </h3>
                    {predictionData.heartDisease?.shapValues ? (
                      Object.entries(predictionData.heartDisease.shapValues).map(([feat, val]: [string, any]) => (
                        <div key={feat} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{feat}</span>
                          <span className={`font-extrabold ${Number(val) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {Number(val) > 0 ? `+${Number(val).toFixed(4)}` : Number(val).toFixed(4)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">No SHAP output available</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PERSONALIZED CHECKLIST RECOMMENDATIONS */}
            {activeTab === 'recommendations' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-heading text-2xl font-bold text-slate-900">Personalized Prevention Plan</h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Actionable lifestyle guidance grounded in your SHAP feature drivers.
                    </p>
                  </div>

                  {recommendations && (
                    <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wide border ${
                      recommendations.urgency === 'high'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : recommendations.urgency === 'moderate'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      Urgency Level: {recommendations.urgency}
                    </span>
                  )}
                </div>

                {recLoading ? (
                  <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 animate-pulse">
                    <Sparkles className="w-8 h-8 text-teal-600 mx-auto mb-2 animate-spin" />
                    <p className="text-xs font-bold text-slate-600">Generating personalized structured recommendations...</p>
                  </div>
                ) : recError ? (
                  <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-3xl text-xs flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>{recError}</span>
                  </div>
                ) : recommendations ? (
                  <div className="space-y-6">
                    {/* Shared Risk Factors Callout */}
                    {recommendations.sharedRiskFactors && recommendations.sharedRiskFactors.length > 0 && (
                      <div className="bg-gradient-to-r from-teal-500/10 via-blue-500/10 to-indigo-500/10 border border-teal-200 p-6 rounded-3xl space-y-2">
                        <div className="flex items-center gap-2 text-teal-800 font-extrabold text-sm">
                          <Sparkles className="w-4 h-4 text-teal-600" />
                          <span>Shared Cardiometabolic Risk Factors</span>
                        </div>
                        <ul className="space-y-1 text-xs text-slate-700 pl-6 list-disc">
                          {recommendations.sharedRiskFactors.map((factor, idx) => (
                            <li key={idx}>{factor}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Diet Checklist */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                          🥗
                        </div>
                        <h3 className="font-heading font-bold text-base text-slate-900">Dietary Action Checklist</h3>
                      </div>

                      <div className="space-y-3">
                        {recommendations.diet.map((item, idx) => {
                          const id = `diet_${idx}`;
                          const isDone = !!checkedItems[id];
                          return (
                            <div
                              key={id}
                              onClick={() => toggleCheck(id)}
                              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                                isDone ? 'bg-emerald-50/60 border-emerald-200 text-slate-500 line-through' : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300'
                              }`}
                            >
                              {isDone ? (
                                <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                              )}
                              <span className="text-xs leading-relaxed font-medium">{item}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Exercise Checklist */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                          🏃
                        </div>
                        <h3 className="font-heading font-bold text-base text-slate-900">Physical Activity Checklist</h3>
                      </div>

                      <div className="space-y-3">
                        {recommendations.exercise.map((item, idx) => {
                          const id = `exercise_${idx}`;
                          const isDone = !!checkedItems[id];
                          return (
                            <div
                              key={id}
                              onClick={() => toggleCheck(id)}
                              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                                isDone ? 'bg-blue-50/60 border-blue-200 text-slate-500 line-through' : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-300'
                              }`}
                            >
                              {isDone ? (
                                <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                              )}
                              <span className="text-xs leading-relaxed font-medium">{item}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sleep & Lifestyle */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                          😴
                        </div>
                        <h3 className="font-heading font-bold text-base text-slate-900">Sleep & Recovery Guidance</h3>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                        {recommendations.sleep}
                      </p>
                    </div>

                    {/* Medical Safety Disclaimer */}
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-start gap-3">
                      <Stethoscope className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <p className="leading-relaxed font-medium">{recommendations.disclaimer}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* TAB 4: CHATBOT */}
            {activeTab === 'chat' && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-500 text-slate-900 flex items-center justify-center font-bold">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-sm">riskLens AI Health Assistant</h3>
                      <p className="text-[10px] text-teal-300">Grounded in your latest assessment + SHAP drivers</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
                    Educational Support Only
                  </span>
                </div>

                {/* Chat History */}
                <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className="space-y-2">
                      <div className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                            msg.sender === 'user'
                              ? 'bg-teal-600 text-white rounded-br-none shadow-xs'
                              : msg.isEmergency
                              ? 'bg-red-600 text-white font-bold rounded-bl-none shadow-md border border-red-700'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-xs'
                          }`}
                        >
                          {msg.isEmergency && (
                            <div className="flex items-center gap-1.5 text-yellow-300 font-extrabold mb-1">
                              <AlertTriangle className="w-4 h-4" />
                              <span>ACUTE MEDICAL EMERGENCY WARNING</span>
                            </div>
                          )}
                          <p className="whitespace-pre-line">{msg.text}</p>
                          <div className="flex items-center justify-between text-[9px] opacity-60 mt-1">
                            {msg.skippedLLM && <span>Pre-Safety Guardrail Triggered</span>}
                            <span className="ml-auto">{msg.time}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl px-4 py-3 text-xs animate-pulse">
                        riskLens AI is evaluating your query against safety guardrails...
                      </div>
                    </div>
                  )}
                </div>

                {/* Sample Prompts */}
                <div className="p-2.5 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto">
                  {[
                    "Why is my heart disease risk score higher?",
                    "What dietary changes help reduce cholesterol?",
                    "What dose of metformin should I take?",
                    "I have severe chest pain right now"
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
          </>
        )}
      </main>
    </div>
  );
};
