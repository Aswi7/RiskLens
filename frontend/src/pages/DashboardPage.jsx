import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, Heart, Activity as PulseIcon, Sparkles,
  MapPin, MessageSquare, Send, RefreshCw,
  FileText, User as UserIcon, Info, AlertTriangle, CheckSquare, Square, Stethoscope, ArrowRight,
  TrendingUp, Navigation, Phone, Search, ExternalLink, Compass
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [predictionData, setPredictionData] = useState(null);
  const [healthScoreData, setHealthScoreData] = useState(null);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Recommendations State
  const [recommendations, setRecommendations] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});

  // Chat State
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'ai',
      text: `Hello ${user?.name || 'there'}! I'm riskLens AI Health Assistant. How can I assist you with your health indicators today?`,
      time: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Nearby Hospitals / Specialists State
  const [userLat, setUserLat] = useState(null);
  const [userLng, setUserLng] = useState(null);
  const [locationInput, setLocationInput] = useState('');
  const [geoError, setGeoError] = useState(null);
  const [conditionFilter, setConditionFilter] = useState('auto'); // 'auto', 'diabetes', 'heart', 'both', 'general'
  const [hospitalsList, setHospitalsList] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);

  // Fetch health score from backend GET /health-score
  const fetchHealthScore = async () => {
    try {
      const res = await api.get('/health-score');
      if (res.data) {
        setHealthScoreData(res.data);
      }
    } catch (e) {
      console.warn('Could not fetch health score:', e);
    }
  };

  // Fetch prediction history from backend for the logged-in user
  useEffect(() => {
    const fetchUserHistory = async () => {
      setLoadingHistory(true);
      fetchHealthScore();
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

  // Fetch Nearby Hospitals & Specialists from Backend API
  const fetchHospitals = async (lat, lng, locStr, filterOverride) => {
    setLoadingHospitals(true);
    try {
      let inferredCondition = 'general';
      const dHigh = predictionData?.diabetes?.risk?.isHighRisk;
      const hHigh = predictionData?.heartDisease?.risk?.isHighRisk;
      if (dHigh && hHigh) inferredCondition = 'both';
      else if (dHigh) inferredCondition = 'diabetes';
      else if (hHigh) inferredCondition = 'heart';

      const activeFilter = filterOverride !== undefined ? filterOverride : conditionFilter;
      const targetCondition = activeFilter === 'auto' ? inferredCondition : activeFilter;

      const params = {};
      if (lat && lng) {
        params.lat = lat;
        params.lng = lng;
      }
      if (locStr) {
        params.location = locStr;
      }
      if (targetCondition) {
        params.condition = targetCondition;
      }

      const res = await api.get('/hospitals/nearby', { params });
      if (res.data && res.data.hospitals) {
        setHospitalsList(res.data.hospitals);
      }
    } catch (err) {
      console.error('Failed to fetch nearby hospitals:', err);
    } finally {
      setLoadingHospitals(false);
    }
  };

  // Geolocation Handler
  const requestGeolocation = () => {
    setLoadingHospitals(true);
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser. Please enter your city or ZIP code below.');
      setLoadingHospitals(false);
      fetchHospitals(null, null, locationInput || 'San Francisco, CA');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLat(lat);
        setUserLng(lng);
        setGeoError(null);
        fetchHospitals(lat, lng, null);
      },
      (error) => {
        console.warn('Geolocation permission denied or error:', error);
        setGeoError('Location access was denied or unavailable. Enter your city or ZIP code below to find nearby specialists.');
        setLoadingHospitals(false);
        fetchHospitals(null, null, locationInput || 'San Francisco, CA');
      },
      { timeout: 8000 }
    );
  };

  // Auto-fetch hospitals on load or predictionData change
  useEffect(() => {
    if (predictionData && hospitalsList.length === 0 && !loadingHospitals) {
      fetchHospitals(userLat, userLng, locationInput);
    }
  }, [predictionData]);

  const fetchRecommendations = async (predictionId) => {
    setRecLoading(true);
    setRecError(null);
    try {
      const res = await api.post('/recommendations', {
        prediction_id: predictionId || predictionData?.id
      });
      setRecommendations(res.data);
    } catch (err) {
      console.error('Error fetching recommendations:', err);
      setRecError('Failed to load personalized recommendations.');
    } finally {
      setRecLoading(false);
    }
  };

  const toggleCheck = (id) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSendMessage = async (textToSend) => {
    const message = textToSend || chatInput;
    if (!message.trim()) return;

    const userMsg = { sender: 'user', text: message, time: 'Just now' };
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
          skippedLLM: replyData.skippedLLM,
          citations: replyData.citations || []
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

  // Process historical trend data from user's actual prediction history (Chronological Ascending)
  const chronologicalHistory = historyRecords.length > 0
    ? historyRecords
        .slice()
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map((record, index) => {
          const d = new Date(record.timestamp);
          const dateStr = !isNaN(d.getTime())
            ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : `Eval ${index + 1}`;
          return {
            evaluation: `Eval ${index + 1}`,
            dateStr,
            fullDate: d.toLocaleString(),
            diabetesRisk: Math.round((record.results?.diabetes?.risk?.probability || 0) * 100),
            heartRisk: Math.round((record.results?.heartDisease?.risk?.probability || 0) * 100),
            healthScore: record.input_payload?.health_score?.total_score || 75
          };
        })
    : [];

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
                  Evaluated: Type 2 Diabetes (XGBoost) &amp; Heart Disease (Logistic Regression with StandardScaler)
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
                { id: 'trend', label: 'Risk Trajectory Trend', icon: TrendingUp },
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
                    onClick={() => setActiveTab(tab.id)}
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
                {/* Transparent Non-ML Health Score Card (Placed BEFORE Disease Risk Section) */}
                {(() => {
                  const hs = healthScoreData || predictionData?.input_payload?.health_score;
                  if (!hs) return null;
                  return (
                    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold text-xl">
                            🏆
                          </div>
                          <div>
                            <h3 className="font-heading font-extrabold text-xl text-slate-900">Overall Health Score</h3>
                            <p className="text-xs text-slate-500 font-medium">
                              Transparent Non-ML Wellness Rating derived from your lifestyle answers.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold border uppercase ${
                            hs.rating === 'Optimal' || hs.rating === 'Good'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {hs.rating || 'Good'}
                          </span>
                          <div className="text-3xl font-extrabold text-slate-900">
                            {hs.total_score} <span className="text-xs font-normal text-slate-400">/ 100</span>
                          </div>
                        </div>
                      </div>

                      {/* Sub-scores breakdown grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                          { title: 'Lifestyle', icon: '🚬', key: 'lifestyle' },
                          { title: 'Fitness', icon: '🏃', key: 'fitness' },
                          { title: 'Nutrition', icon: '🥗', key: 'nutrition' },
                          { title: 'Sleep', icon: '😴', key: 'sleep' },
                          { title: 'Stress', icon: '🧘', key: 'stress' }
                        ].map((sub) => {
                          const info = hs.breakdown?.[sub.key] || { score: 15, max: 20 };
                          const pct = (info.score / info.max) * 100;
                          return (
                            <div key={sub.key} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1.5">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                <span className="flex items-center gap-1">
                                  <span>{sub.icon}</span> {sub.title}
                                </span>
                                <span className="text-teal-700">{info.score}/{info.max}</span>
                              </div>
                              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-teal-600 h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
                        <Info className="w-4 h-4 text-teal-600 shrink-0" />
                        <span>{hs.formula_documentation || "Transparent weighted formula calculated from non-ML intake (Lifestyle 20, Fitness 20, Nutrition 20, Sleep 20, Stress 20). Placed independently of machine learning disease predictions."}</span>
                      </div>
                    </div>
                  );
                })()}

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
                          .map(([feat, val]) => (
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
                          .map(([feat, val]) => (
                            <div key={feat} className="flex items-center justify-between text-xs py-1">
                              <span className="text-slate-600 font-medium">{feat}</span>
                              <span className="font-extrabold text-red-600">+{Number(val).toFixed(4)}</span>
                            </div>
                          ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: TREND TRAJECTORY VIEW */}
            {activeTab === 'trend' && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-heading text-2xl font-bold text-slate-900">Longitudinal Risk Trajectory</h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Tracks changes in your Type 2 Diabetes and Heart Disease risk probabilities over time.
                  </p>
                </div>

                {chronologicalHistory.length >= 2 ? (
                  /* IF 2+ past predictions exist: render interactive Recharts Line Chart */
                  <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div>
                        <div className="text-xs font-extrabold text-teal-700 uppercase tracking-wider">
                          Historical Evaluations ({chronologicalHistory.length} Recorded)
                        </div>
                        <h3 className="font-heading text-lg font-bold text-slate-900 mt-0.5">
                          Risk Score Trajectory Over Time
                        </h3>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-bold">
                        <span className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Diabetes Risk
                        </span>
                        <span className="flex items-center gap-1.5 text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-200">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Heart Risk
                        </span>
                      </div>
                    </div>

                    <div className="h-72 w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chronologicalHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                          <XAxis dataKey="dateStr" stroke="#94A3B8" fontSize={12} />
                          <YAxis stroke="#94A3B8" fontSize={12} domain={[0, 100]} unit="%" />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0F172A', color: '#fff', borderRadius: '12px', fontSize: '12px' }}
                            formatter={(val, name) => [`${val}%`, name === 'diabetesRisk' ? 'Diabetes Risk' : 'Heart Risk']}
                          />
                          <Line type="monotone" dataKey="diabetesRisk" stroke="#F59E0B" strokeWidth={3} dot={{ r: 6 }} name="Diabetes Risk" />
                          <Line type="monotone" dataKey="heartRisk" stroke="#EF4444" strokeWidth={3} dot={{ r: 6 }} name="Heart Risk" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
                      <div className="font-bold text-slate-800">Trajectory Summary:</div>
                      <p>
                        Baseline Evaluation (Initial): Diabetes Risk {chronologicalHistory[0].diabetesRisk}%, Heart Risk {chronologicalHistory[0].heartRisk}%.
                        Latest Evaluation ({chronologicalHistory[chronologicalHistory.length - 1].dateStr}): Diabetes Risk {chronologicalHistory[chronologicalHistory.length - 1].diabetesRisk}%, Heart Risk {chronologicalHistory[chronologicalHistory.length - 1].heartRisk}%.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* IF fewer than 2 predictions exist: render friendly empty state encouraging re-check */
                  <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm max-w-2xl mx-auto space-y-5">
                    <div className="w-16 h-16 rounded-3xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto">
                      <TrendingUp className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-heading text-xl font-bold text-slate-900">Longitudinal Trend Trajectory Requires 2+ Assessments</h3>
                      <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
                        You currently have 1 health evaluation recorded in your profile. Take periodic assessments (e.g. monthly or after adopting new diet &amp; exercise habits) to unlock multi-point risk trajectory trend lines over time.
                      </p>
                    </div>
                    <button
                      onClick={() => navigate('/assessment')}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                      <span>Take New Assessment</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SHAP EXPLAINABILITY */}
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
                      Object.entries(predictionData.diabetes.shapValues).map(([feat, val]) => (
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
                      Object.entries(predictionData.heartDisease.shapValues).map(([feat, val]) => (
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

            {/* TAB 4: PERSONALIZED CHECKLIST RECOMMENDATIONS */}
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
                        <h3 className="font-heading font-bold text-base text-slate-900">Sleep &amp; Recovery Guidance</h3>
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

            {/* TAB 5: CHATBOT */}
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
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-wrap gap-1.5 items-center">
                              <span className="text-[10px] font-semibold text-teal-800">Source:</span>
                              {msg.citations.map((cit, idx) => {
                                const docName = typeof cit === 'string' ? cit : cit.sourceDocument;
                                return (
                                  <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-teal-700 text-[10px] font-medium border border-teal-200">
                                    📖 {docName}
                                  </span>
                                );
                              })}
                            </div>
                          )}
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

            {/* TAB 6: HOSPITALS & SPECIALISTS FINDER */}
            {activeTab === 'specialists' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-heading text-2xl font-bold text-slate-900">Nearby Hospitals &amp; Specialists</h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      Calls Google Places API to find nearby hospitals and condition-mapped specialists (Endocrinologists for Diabetes, Cardiologists for Heart Disease).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={requestGeolocation}
                    disabled={loadingHospitals}
                    className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer shrink-0"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>Use My Geolocation</span>
                  </button>
                </div>

                {/* Geolocation Denial / Error Banner & Manual Location Fallback Input */}
                {geoError && (
                  <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Geolocation Fallback:</span>
                      <span>{geoError}</span>
                    </div>
                  </div>
                )}

                {/* Search Bar & Condition Filters */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchHospitals(userLat, userLng, locationInput)}
                        placeholder="Search manual city or ZIP code (e.g. San Francisco, CA)..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => fetchHospitals(userLat, userLng, locationInput)}
                      className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Search Facilities
                    </button>
                  </div>

                  {/* Condition Filter Controls */}
                  <div className="flex items-center gap-2 overflow-x-auto pt-1 border-t border-slate-100">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider shrink-0 mr-1">
                      Specialist Filter:
                    </span>
                    {[
                      { id: 'auto', label: '⚡ Auto-Inferred from Risk' },
                      { id: 'diabetes', label: '🩺 Endocrinologists (Diabetes)' },
                      { id: 'heart', label: '❤️ Cardiologists (Heart)' },
                      { id: 'both', label: '🏥 Both Specialists' },
                      { id: 'general', label: '🏥 General Hospitals' },
                    ].map((f) => {
                      const isActive = conditionFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setConditionFilter(f.id);
                            fetchHospitals(userLat, userLng, locationInput, f.id);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                            isActive
                              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Hospitals & Specialists Results List */}
                {loadingHospitals ? (
                  <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm animate-pulse space-y-2">
                    <Compass className="w-8 h-8 text-teal-600 mx-auto animate-spin" />
                    <p className="text-xs font-bold text-slate-600">Querying nearby hospitals &amp; condition specialists...</p>
                  </div>
                ) : hospitalsList.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {hospitalsList.map((doc) => (
                      <div key={doc.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-teal-300 transition-all">
                        <div className="space-y-3">
                          <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold">
                            <Stethoscope className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-heading font-extrabold text-base text-slate-900">{doc.name}</h3>
                            <span className="text-xs text-teal-700 font-bold block">{doc.specialty}</span>
                            <span className="text-xs text-slate-500 block mt-1">{doc.address}</span>
                          </div>

                          <div className="pt-2 text-xs text-slate-600 space-y-1.5 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-slate-500">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span>{doc.distance}</span>
                              </span>
                              <span className="font-bold text-amber-600">
                                ★ {doc.rating} ({doc.user_ratings_total})
                              </span>
                            </div>

                            {doc.phone && (
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                <span>{doc.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                          {doc.google_maps_url && (
                            <a
                              href={doc.google_maps_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <span>Directions</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {doc.phone && (
                            <a
                              href={`tel:${doc.phone}`}
                              className="px-3 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold transition-colors inline-flex items-center justify-center cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
                    <p className="text-xs font-bold text-slate-500">No nearby specialists found matching your search. Try changing location or condition filter.</p>
                  </div>
                )}

                <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl text-slate-600 text-xs flex items-center gap-2">
                  <Info className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>RiskLens provides nearby facility information for user convenience only. We do not receive referral fees or endorse specific healthcare providers.</span>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
