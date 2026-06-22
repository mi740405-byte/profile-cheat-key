import React, { useState, useEffect, useRef } from "react";
import { 
  motion, 
  AnimatePresence 
} from "motion/react";
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  History, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Download, 
  Edit3, 
  Save, 
  Upload, 
  Info, 
  FileCheck, 
  Check, 
  ChevronRight, 
  RefreshCw,
  Clock,
  Briefcase,
  Building
} from "lucide-react";
import { 
  STARData, 
  CheatKeyProject, 
  StepType, 
  TONE_PRESETS, 
  QUESTION_PRESETS 
} from "./types";

export default function App() {
  // --- States ---
  const [projects, setProjects] = useState<CheatKeyProject[]>([]);
  const [currentProject, setCurrentProject] = useState<CheatKeyProject | null>(null);
  const [activeStep, setActiveStep] = useState<StepType>('history');
  const [hasApiKey, setHasApiKey] = useState(true);
  
  // Loader states
  const [isAnalyzingStar, setIsAnalyzingStar] = useState(false);
  const [isGeneratingCV, setIsGeneratingCV] = useState(false);
  const [isFileParsing, setIsFileParsing] = useState<{ experience: boolean; jobAd: boolean }>({
    experience: false,
    jobAd: false
  });

  // Modal Editing STAR states
  const [editingStarKey, setEditingStarKey] = useState<keyof STARData | null>(null);
  const [starEditText, setStarEditText] = useState("");

  // UI alert states
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // File inputs references
  const fileInputExpRef = useRef<HTMLInputElement>(null);
  const fileInputJobRef = useRef<HTMLInputElement>(null);

  // --- Load Initial Projects History from LocalStorage ---
  useEffect(() => {
    // Check API availability
    fetch("/api/status")
      .then(res => res.json())
      .then(data => setHasApiKey(!!data.hasApiKey))
      .catch(err => {
        console.error("Status check error:", err);
        setHasApiKey(false);
      });

    try {
      const stored = localStorage.getItem("cheatkey_projects");
      if (stored) {
        const parsed = JSON.parse(stored);
        setProjects(parsed);
        // If there are projects, default to history view. Otherwise, default to creating.
        if (parsed.length === 0) {
          setActiveStep('info');
          initNewProject();
        }
      } else {
        // First-time user: move to info page directly with empty project
        setActiveStep('info');
        initNewProject();
      }
    } catch (err) {
      console.error("Localstorage load error:", err);
    }
  }, []);

  // --- Save Projects to LocalStorage and sync current ---
  const saveProjects = (updatedList: CheatKeyProject[]) => {
    setProjects(updatedList);
    localStorage.setItem("cheatkey_projects", JSON.stringify(updatedList));
  };

  // --- Initialize Blank Active Project ---
  const initNewProject = () => {
    const newProject: CheatKeyProject = {
      id: "proj_" + Date.now(),
      companyName: "",
      jobTitle: "",
      rawExperience: "",
      rawJobAd: "",
      starData: {
        situation: "",
        task: "",
        action: "",
        result: ""
      },
      question: QUESTION_PRESETS[0],
      targetLength: 500,
      tone: "professional",
      generatedCoverLetter: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setCurrentProject(newProject);
    setActiveStep('info');
  };

  // --- Trigger Alert Toast ---
  const triggerAlert = (type: 'success' | 'error' | 'info', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => {
      setAlertMsg(null);
    }, 4500);
  };

  // --- Load an Existing Project from History ---
  const handleSelectProject = (project: CheatKeyProject) => {
    // Perform deep copy to prevent direct state mutability side-effects
    setCurrentProject(JSON.parse(JSON.stringify(project)));
    if (project.generatedCoverLetter) {
      setActiveStep('final');
    } else if (project.starData?.situation) {
      setActiveStep('star');
    } else {
      setActiveStep('info');
    }
    triggerAlert('info', `"${project.companyName || '무명 기업'} - ${project.jobTitle || '미정 직무'}" 이력을 불러왔습니다.`);
  };

  // --- Delete a Project ---
  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent select event trigger
    if (window.confirm("정말로 이 자소서 치트키 작성 이력을 영구 삭제하시겠습니까?")) {
      const filtered = projects.filter(p => p.id !== id);
      saveProjects(filtered);
      triggerAlert('success', "작성 이력이 성공적으로 삭제되었습니다.");
      
      if (currentProject && currentProject.id === id) {
        if (filtered.length > 0) {
          setCurrentProject(JSON.parse(JSON.stringify(filtered[0])));
        } else {
          initNewProject();
        }
      }
    }
  };

  // ---- Handle Draft Text Changes on Active Project ----
  const handleUpdateField = (key: keyof CheatKeyProject, value: any) => {
    if (!currentProject) return;
    const updated = {
      ...currentProject,
      [key]: value,
      updatedAt: new Date().toISOString()
    };
    setCurrentProject(updated);

    // Auto-save progress inside existing local history array
    const exists = projects.some(p => p.id === currentProject.id);
    let updatedList;
    if (exists) {
      updatedList = projects.map(p => p.id === currentProject.id ? updated : p);
    } else {
      updatedList = [updated, ...projects];
    }
    saveProjects(updatedList);
  };

  // ---- Drag & Drop upload handler ----
  const handleFileUpload = async (file: File, type: 'experience' | 'jobAd') => {
    if (!currentProject) return;
    
    // File Guard: 10MB limit check
    if (file.size > 10 * 1024 * 1024) {
      triggerAlert('error', "파일 업로드 한도를 준수해 주세요 (최대 10MB).");
      return;
    }

    setIsFileParsing(prev => ({ ...prev, [type]: true }));
    triggerAlert('info', `${file.name} 문서의 텍스트를 파싱하는 중입니다...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/parse-file", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errorJson = await res.json();
        throw new Error(errorJson.error || "파일 파싱 실패");
      }

      const data = await res.json();
      
      if (type === 'experience') {
        const currentText = currentProject.rawExperience;
        const newText = currentText 
          ? `${currentText}\n\n[첨부 파일 텍스트: ${data.fileName}]\n${data.text}`
          : data.text;
        handleUpdateField('rawExperience', newText);
      } else {
        const currentText = currentProject.rawJobAd;
        const newText = currentText 
          ? `${currentText}\n\n[첨부 파일 텍스트: ${data.fileName}]\n${data.text}`
          : data.text;
        handleUpdateField('rawJobAd', newText);
      }

      triggerAlert('success', `문서 내용이 본문에 성공적으로 주입되었습니다!`);
    } catch (err: any) {
      console.error(err);
      triggerAlert('error', err.message || "파싱 가드 실패: 텍스트를 직접 복사하여 붙여넣어 주세요.");
    } finally {
      setIsFileParsing(prev => ({ ...prev, [type]: false }));
    }
  };

  // --- Step 1 -> 2: 1차 AI 호출 (STAR 도출) ---
  const handleGenerateSTAR = async () => {
    if (!currentProject) return;
    const expText = currentProject.rawExperience || "";
    if (!expText.trim()) {
      triggerAlert('error', "나의 이력이나 프로젝트 경험을 상세하게 작성하시거나 파일을 업로드해 주세요.");
      return;
    }

    setIsAnalyzingStar(true);
    triggerAlert('info', "Gemini AI가 내 경험 데이터를 분석하여 STAR(상황-과제-행동-성과) 뼈대를 맞춤형으로 추출하는 중입니다...");

    try {
      const res = await fetch("/api/generate-star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: currentProject.companyName || "",
          jobTitle: currentProject.jobTitle || "",
          rawExperience: expText,
          rawJobAd: currentProject.rawJobAd || ""
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "STAR 도출 실패");
      }

      const starOutput: STARData = await res.json();
      
      const updated = {
        ...currentProject,
        starData: starOutput,
        updatedAt: new Date().toISOString()
      };
      
      setCurrentProject(updated);
      
      // Update history list
      const updatedList = projects.some(p => p.id === currentProject.id)
        ? projects.map(p => p.id === currentProject.id ? updated : p)
        : [updated, ...projects];
      saveProjects(updatedList);

      setActiveStep('star');
      triggerAlert('success', "STAR 경험 교정 카드가 분석 완료되었습니다! 미세 편집을 진행해 보세요.");
    } catch (err: any) {
      console.error(err);
      triggerAlert('error', err.message || "AI 분석에 실패했습니다. Gemini API 키 설정을 확인해 주십시오.");
    } finally {
      setIsAnalyzingStar(false);
    }
  };

  // --- Edit Single STAR Part inside Local Modal ---
  const openEditStarModal = (key: keyof STARData) => {
    if (!currentProject) return;
    setEditingStarKey(key);
    setStarEditText(currentProject.starData[key] || "");
  };

  const saveStarModifications = () => {
    if (!currentProject || !editingStarKey) return;
    
    const updatedStar = {
      ...currentProject.starData,
      [editingStarKey]: starEditText
    };

    const updated = {
      ...currentProject,
      starData: updatedStar,
      updatedAt: new Date().toISOString()
    };

    setCurrentProject(updated);
    
    const updatedList = projects.map(p => p.id === currentProject.id ? updated : p);
    saveProjects(updatedList);

    setEditingStarKey(null);
    triggerAlert('success', `${editingStarKey.toUpperCase()} 영역이 수동 보정 완료되어 반영되었습니다!`);
  };

  // --- Step 2 -> 3: 2차 AI 호출 (최종 자소서 초안 생성) ---
  const handleGenerateCoverLetter = async () => {
    if (!currentProject) return;
    if (!currentProject.starData.situation || !currentProject.starData.action) {
      triggerAlert('error', "STAR 교정 카드 정보가 부족합니다. Step 2 단계를 마쳐주세요.");
      return;
    }

    setIsGeneratingCV(true);
    triggerAlert('info', `설정한 매칭 문항과 목표 분량(${currentProject.targetLength}자)에 맞게 최종 자기소개서 초안을 도출하는 중입니다...`);

    try {
      const res = await fetch("/api/generate-cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: currentProject.companyName,
          jobTitle: currentProject.jobTitle,
          starData: currentProject.starData,
          question: currentProject.question,
          targetLength: currentProject.targetLength,
          tone: TONE_PRESETS.find(t => t.id === currentProject.tone)?.label || currentProject.tone
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "자기소개서 생성 실패");
      }

      const result = await res.json();
      
      const updated = {
        ...currentProject,
        generatedCoverLetter: result.coverLetter,
        updatedAt: new Date().toISOString()
      };

      setCurrentProject(updated);

      const updatedList = projects.map(p => p.id === currentProject.id ? updated : p);
      saveProjects(updatedList);

      setActiveStep('final');
      triggerAlert('success', "맞춤형 AI 자소서 도출이 완벽하게 완료되었습니다! 실시간 세부 분석을 확인하십시오.");
    } catch (err: any) {
      console.error(err);
      triggerAlert('error', err.message || "자소서 생성 중 오류가 발생했습니다. AI 설정이나 텍스트 길이를 확인해 주세요.");
    } finally {
      setIsGeneratingCV(false);
    }
  };

  // --- Utility: Clipboard Copy ---
  const handleCopyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    triggerAlert('success', "자기소개서 전문이 클립보드에 복사되었습니다!");
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Utility: Document Export Download (.txt) ---
  const handleDownloadFile = (project: CheatKeyProject) => {
    if (!project.generatedCoverLetter) return;

    const separator = "=".repeat(40);
    const textContent = 
`[자소서 치트키 - 인쇄 영수증 양식 문서]
지원 기업: ${project.companyName || "미정"}
희망 직무: ${project.jobTitle || "미정"}
작성 날짜: ${new Date(project.updatedAt).toLocaleDateString()}
${separator}
[지원 문항]
${project.question}
${separator}
[최종 합격 자기소개서 내용]

${project.generatedCoverLetter}

${separator}
[기반 STAR 뼈대 이력]
S (상황): ${project.starData.situation}
T (과제): ${project.starData.task}
A (행동): ${project.starData.action}
R (성과): ${project.starData.result}

${separator}
Generated via 자소서 치트키 (CheatKey) App. All Rights Reserved.`;

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    // Formatting filename safely
    const cleanCompany = (project.companyName || "자소서").replace(/[^a-zA-Z0-9가-힣]/g, "");
    const cleanJob = (project.jobTitle || "치트키").replace(/[^a-zA-Z0-9가-힣]/g, "");
    link.download = `${cleanCompany}_${cleanJob}_자기소개서.txt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    triggerAlert('success', "자소서가 인쇄 전용 텍스트 문서파일로 다운로드 되었습니다.");
  };

  // --- Letter Count Helpers ---
  const getCharCounts = (text: string) => {
    if (!text) return { withSpace: 0, withoutSpace: 0 };
    return {
      withSpace: text.length,
      withoutSpace: text.replace(/\s/g, "").length
    };
  };

  const { withSpace, withoutSpace } = getCharCounts(currentProject?.generatedCoverLetter || "");
  const targetGoal = currentProject?.targetLength || 500;
  
  // Calculate if the output strictly conforms to the target ±5% guidelines
  const lowerRange = targetGoal * 0.95;
  const upperRange = targetGoal * 1.05;
  const isOptimal = withSpace >= lowerRange && withSpace <= upperRange;

  return (
    <div id="cheatkey-app-root" className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased flex flex-col">
      
      {/* --- Top Sticky Navigation Header --- */}
      <header id="main-nav-header" className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveStep('history')}>
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-slate-900">자소서 치트키</span>
              <span className="ml-1.5 px-2 py-0.5 text-2xs font-bold text-blue-700 bg-blue-50 rounded-md border border-blue-100">CheatKey</span>
            </div>
          </div>

          {/* Stepper Progress Bar (Displays on Create sequence) */}
          {activeStep !== 'history' && currentProject && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-100 p-1 rounded-lg">
              <button 
                id="step-tab-1"
                onClick={() => setActiveStep('info')}
                className={`px-3 py-1.5 rounded-md transition-all ${activeStep === 'info' ? 'bg-white text-blue-600 shadow-xs font-semibold' : 'hover:text-slate-900'}`}
              >
                1. 이력 정보 입력
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <button 
                id="step-tab-2"
                onClick={() => {
                  if (currentProject.starData?.situation) {
                    setActiveStep('star');
                  } else {
                    triggerAlert('info', '우선 경험 구조 분석을 진행해야 STAR 조정을 하실 수 있습니다.');
                  }
                }}
                disabled={!currentProject.starData?.situation}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  activeStep === 'star' 
                    ? 'bg-white text-blue-600 shadow-xs font-semibold' 
                    : currentProject.starData?.situation 
                      ? 'hover:text-slate-900 cursor-pointer' 
                      : 'opacity-50 cursor-not-allowed'
                }`}
              >
                2. STAR 보정
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <button 
                id="step-tab-3"
                onClick={() => {
                  if (currentProject.generatedCoverLetter) {
                    setActiveStep('final');
                  } else {
                    triggerAlert('info', '자소서가 아직 도출되지 않았습니다. STAR 카드에서 하단 생성을 클릭해 주세요.');
                  }
                }}
                disabled={!currentProject.generatedCoverLetter}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  activeStep === 'final' 
                    ? 'bg-white text-blue-600 shadow-xs font-semibold' 
                    : currentProject.generatedCoverLetter 
                      ? 'hover:text-slate-900 cursor-pointer' 
                      : 'opacity-50 cursor-not-allowed'
                }`}
              >
                3. 최종 합격 초안
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              id="top-history-btn"
              onClick={() => setActiveStep('history')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeStep === 'history' 
                  ? 'bg-slate-950 text-white' 
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              저장된 이력 ({projects.length})
            </button>
            
            <button
              id="top-new-cheat-btn"
              onClick={initNewProject}
              className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              새 치트키
            </button>
          </div>

        </div>
      </header>

      {/* --- Main Contents Container --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-start">
        
        {/* Environment Alert Bar (Check if key exists in dev environment) */}
        {!hasApiKey && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex gap-3 items-start shadow-xs animate-pulse">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Gemini API 키 로드 실패 경고</p>
              <p className="mt-1 text-xs text-amber-700">
                우측 상단 <strong>Settings &gt; Secrets</strong> 패널에서 <code>GEMINI_API_KEY</code>를 설정한 후에 쾌적한 AI 가동이 가능합니다. 설정이 완료되면 웹 브라우저 화면이 새로고침되거나 백엔드에 자동 반영됩니다.
              </p>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          
          {/* ======================================================== */}
          {/* STEP 0: Dashboard & Typing History List                  */}
          {/* ======================================================== */}
          {activeStep === 'history' && (
            <motion.div
              key="history-step"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col justify-start"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    🔑 자소서 치트키 대시보드
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    신입 구직자들을 위한 최고의 STAR 자소서 비서실. 이력과 공고를 분석해 기적의 소리를 연출해 드립니다.
                  </p>
                </div>
              </div>

              {projects.length === 0 ? (
                <div id="empty-history-visual" className="flex-1 flex flex-col items-center justify-center text-center p-8 sm:p-16 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">새 자소서 치트키를 만들어 보세요!</h3>
                  <p className="text-sm text-slate-500 max-w-sm mt-2 mb-6">
                    이력서나 경험한 에피소드를 업로드하면, AI가 합격급 STAR 문장 구조로 교정하고 완성도 높은 맞춤형 자소서를 도출합니다.
                  </p>
                  <button
                    id="dashboard-start-first-btn"
                    onClick={initNewProject}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-md transition-all hover:scale-[1.02]"
                  >
                    <Plus className="w-5 h-5" />
                    첫 치트키 프로젝트 시작하기
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map((project) => {
                    const progress = project.generatedCoverLetter ? '3단계 (최종)' : project.starData?.situation ? '2단계 (보정)' : '1단계 (작성)';
                    return (
                      <div
                        key={project.id}
                        id={`project-card-${project.id}`}
                        onClick={() => handleSelectProject(project)}
                        className="group bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md hover:border-blue-400 transition-all duration-200 cursor-pointer flex flex-col justify-between h-52 relative overflow-hidden"
                      >
                        {/* Vertical Accent Ribbons */}
                        <div className={`absolute top-0 left-0 w-1.5 h-full ${
                          project.generatedCoverLetter ? 'bg-emerald-500' : project.starData?.situation ? 'bg-blue-500' : 'bg-slate-300'
                        }`} />

                        <div className="pl-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-2xs font-extrabold px-2 py-0.5 uppercase tracking-wider rounded-md { bg-slate-100 text-slate-600 }">
                              {progress}
                            </span>
                            <button
                              id={`delete-btn-${project.id}`}
                              onClick={(e) => handleDeleteProject(project.id, e)}
                              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                              title="삭제하기"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <h4 className="font-extrabold text-lg text-slate-800 line-clamp-1 mt-2.5 flex items-center gap-1.5">
                            {project.companyName || "미명 기업 (무명)"}
                          </h4>
                          <p className="text-xs font-semibold text-blue-600 line-clamp-1 mt-0.5 flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5 shrink-0" />
                            {project.jobTitle || "지원 직무 미지정"}
                          </p>

                          {project.question && (
                            <p className="text-xs text-slate-500 line-clamp-2 mt-3 leading-relaxed border-t border-slate-100 pt-2">
                              Q: {project.question}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-50 pt-3 pl-2 mt-3 text-slate-400">
                          <span className="text-3xs flex items-center gap-1 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(project.updatedAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs font-bold text-slate-700 group-hover:text-blue-600 flex items-center gap-0.5 transition-colors">
                            이어 쓰기 <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ======================================================== */}
          {/* STEP 1: Main Basic Information & Experience Upload        */}
          {/* ======================================================== */}
          {activeStep === 'info' && currentProject && (
            <motion.div
              key="info-step"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Left Column: Input Forms */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Meta Fields */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                  <h3 className="font-bold text-lg text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                    <Building className="w-5 h-5 text-blue-600" />
                    지원 기업 및 희망 직무 정보
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">지원할 기업명</label>
                      <input
                        type="text"
                        placeholder="예: 토스, 라인 플러스, 구글 코리아"
                        value={currentProject.companyName || ""}
                        onChange={(e) => handleUpdateField('companyName', e.target.value)}
                        className="w-full px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">지원 희망 직무</label>
                      <input
                        type="text"
                        placeholder="예: 프론트엔드 개발자, 서비스 기획 인턴"
                        value={currentProject.jobTitle || ""}
                        onChange={(e) => handleUpdateField('jobTitle', e.target.value)}
                        className="w-full px-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Core Field A: Experience Source */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                      나의 프로젝트 / 이력 경험 서술 *
                    </h3>
                    
                    {/* File Attachment input */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="file"
                        ref={fileInputExpRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'experience');
                        }}
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputExpRef.current?.click()}
                        disabled={isFileParsing.experience}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                      >
                        {isFileParsing.experience ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        파일 업로드 (Word / PDF)
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    프로젝트 경험, 학회 대외활동, 아르바이트 중 강조하고 싶은 성취를 편하게 적어 주세요. 두서없이 낙서처럼 작성하셔도 AI가 완벽히 STAR 기법으로 고쳐 드립니다!
                  </p>

                  <textarea
                    rows={8}
                    className="w-full p-4 text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 placeholder-slate-400 font-sans"
                    placeholder="예시: 2025년 3학년 학기말 캡스톤 디자인 프로젝트 진행. React랑 Node.js 썼음. 백엔드에서 사용자 인증 에러랑 DB 병목이 터졌음. 내가 소켓 통신을 개선해서 로딩 수치를 3초에서 0.5초로 줄였음. 피드백 점수 A 받았던 기억이 남."
                    value={currentProject.rawExperience || ""}
                    onChange={(e) => handleUpdateField('rawExperience', e.target.value)}
                  />
                  
                  {(currentProject.rawExperience || "").length > 0 && (
                    <div className="text-right text-3xs font-semibold text-slate-400">
                      공백 포함 {(currentProject.rawExperience || "").length}자 입력됨
                    </div>
                  )}
                </div>

                {/* Core Field B: Job Description / Ad (Optional) */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-slate-500" />
                      기업 채용 공고 또는 직무 기술서 (선택)
                    </h3>
                    
                    {/* File Attachment input */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="file"
                        ref={fileInputJobRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'jobAd');
                        }}
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputJobRef.current?.click()}
                        disabled={isFileParsing.jobAd}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                      >
                        {isFileParsing.jobAd ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        공고 업로드 (텍스트 추출)
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400">
                    원하는 채용 조건이나 자격 요건 텍스트를 기입하면, AI가 해당 직무 키워드에 내 경험을 자석처럼 딱 달라붙게 유도해 줍니다.
                  </p>

                  <textarea
                    rows={4}
                    className="w-full p-4 text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 placeholder-slate-400 font-sans"
                    placeholder="채용공고의 자격 요건, 우대 사항 등을 긁어와 붙여주세요."
                    value={currentProject.rawJobAd || ""}
                    onChange={(e) => handleUpdateField('rawJobAd', e.target.value)}
                  />
                </div>

                {/* Launch Action */}
                <div className="flex items-center justify-end">
                  <button
                    id="trigger-star-analysis-btn"
                    onClick={handleGenerateSTAR}
                    disabled={isAnalyzingStar || isFileParsing.experience || isFileParsing.jobAd}
                    className="flex items-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 font-bold text-white text-base rounded-xl cursor-pointer shadow-lg hover:shadow-xl transition-all hover:scale-[1.01]"
                  >
                    {isAnalyzingStar ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        치트키 가동 및 분석 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        기적의 STAR 뼈대 분석 개시 (무료)
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>

              </div>

              {/* Right Column: Dynamic Guidelines Tip Panel */}
              <div className="space-y-6">
                
                <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md border border-slate-800">
                  <h4 className="font-extrabold text-white text-base flex items-center gap-1.5">
                    <Info className="w-5 h-5 text-blue-400 shrink-0" />
                    실시간 사용설명서
                  </h4>
                  
                  <ul className="mt-4 space-y-4 text-xs text-slate-300 font-medium">
                    <li className="flex gap-2 items-start">
                      <span className="w-5 h-5 bg-slate-800 text-blue-400 rounded-full flex items-center justify-center shrink-0 font-bold">1</span>
                      <div>
                        <strong className="text-white block mb-0.5">이력서를 그대로 넣으세요.</strong>
                        피디에프 파일이나 워드 문서를 그대로 끌어다 업로드 하시면 텍스트가 자동으로 완벽하게 채워집니다.
                      </div>
                    </li>
                    <li className="flex gap-2 items-start">
                      <span className="w-5 h-5 bg-slate-800 text-blue-400 rounded-full flex items-center justify-center shrink-0 font-bold">2</span>
                      <div>
                        <strong className="text-white block mb-0.5">1차 호출(STAR 뼈대 분석)</strong>
                        내 정돈되지 않은 경험에서 주 키워드인 상황(S), 역할(T), 대책(A), 수량화 성과(R)를 유기적으로 가려 뽑아냅니다.
                      </div>
                    </li>
                    <li className="flex gap-2 items-start">
                      <span className="w-5 h-5 bg-slate-800 text-blue-400 rounded-full flex items-center justify-center shrink-0 font-bold">3</span>
                      <div>
                        <strong className="text-white block mb-0.5">어조(Tone) 세팅</strong>
                        가장 나답고, 세련되며 희망 직종 규격에 부합하는 다양한 어조를 다음 단계에서 맞출 수 있습니다.
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                  <h4 className="font-bold text-slate-800 text-sm mb-3">최근 작성 이력</h4>
                  <div className="space-y-3">
                    {projects.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProject(p)}
                        className="p-3 border border-slate-100 rounded-lg hover:border-blue-200 hover:bg-blue-50 cursor-pointer transition-all"
                      >
                        <h5 className="font-bold text-xs text-slate-800 truncate">{p.companyName || "무명 기업"}</h5>
                        <p className="text-3xs text-slate-400 mt-1">{new Date(p.updatedAt).toLocaleDateString()}</p>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-4">최근 저장된 이력이 아직 없습니다.</p>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* ======================================================== */}
          {/* STEP 2: STAR Logical Editing System (Card swipe-views)   */}
          {/* ======================================================== */}
          {activeStep === 'star' && currentProject && (
            <motion.div
              key="star-step"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="space-y-6 flex-1 flex flex-col justify-start"
            >
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    🔄 Step 2. AI 추천 STAR 교정 에디터
                  </h2>
                  <p className="text-slate-500 text-xs mt-1">
                    AI가 분석 완료한 뼈대입니다. 각 구역의 연필 아이콘을 눌러 구체적 기술이나 숫자를 미세 조정하면 최고의 결과가 나옵니다!
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveStep('info')}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" /> 이전 단계
                  </button>
                </div>
              </div>

              {/* STAR 4-Bento Grid Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Situation Card */}
                <div 
                  id="star-card-situation"
                  onClick={() => openEditStarModal('situation')}
                  className="group bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px]"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-full -mr-8 -mt-8 opacity-20 pointer-events-none" />
                  <div>
                    <span className="inline-block text-xs font-black px-2.5 py-1 bg-red-50 text-rose-600 rounded-md mb-3 border border-rose-100">
                      S · Situation (어떤 환경/기회였는가)
                    </span>
                    <p className="text-sm font-medium text-slate-700 leading-relaxed pl-1 line-clamp-4">
                      {currentProject.starData.situation || "상황 배경 정보가 공란 상태입니다."}
                    </p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <span className="text-xs font-bold text-slate-400 group-hover:text-blue-500 flex items-center gap-1 transition-colors">
                      <Edit3 className="w-3.5 h-3.5" /> 세부 교정하기
                    </span>
                  </div>
                </div>

                {/* Task Card */}
                <div 
                  id="star-card-task"
                  onClick={() => openEditStarModal('task')}
                  className="group bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px]"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-full -mr-8 -mt-8 opacity-20 pointer-events-none" />
                  <div>
                    <span className="inline-block text-xs font-black px-2.5 py-1 bg-amber-50 text-amber-600 rounded-md mb-3 border border-amber-100">
                      T · Task (나의 구체적 의무와 목표는)
                    </span>
                    <p className="text-sm font-medium text-slate-700 leading-relaxed pl-1 line-clamp-4">
                      {currentProject.starData.task || "목표 과제 정보가 공란 상태입니다."}
                    </p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <span className="text-xs font-bold text-slate-400 group-hover:text-blue-500 flex items-center gap-1 transition-colors">
                      <Edit3 className="w-3.5 h-3.5" /> 세부 교정하기
                    </span>
                  </div>
                </div>

                {/* Action Card */}
                <div 
                  id="star-card-action"
                  onClick={() => openEditStarModal('action')}
                  className="group bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px]"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-8 -mt-8 opacity-20 pointer-events-none" />
                  <div>
                    <span className="inline-block text-xs font-black px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md mb-3 border border-blue-100">
                      A · Action (내가 한 구체적인 극복 조치는) *
                    </span>
                    <p className="text-sm font-medium text-slate-700 leading-relaxed pl-1 line-clamp-4">
                      {currentProject.starData.action || "수집한 행동 수치가 공란 상태입니다."}
                    </p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <span className="text-xs font-bold text-slate-400 group-hover:text-blue-500 flex items-center gap-1 transition-colors">
                      <Edit3 className="w-3.5 h-3.5" /> 세부 교정하기
                    </span>
                  </div>
                </div>

                {/* Result Card */}
                <div 
                  id="star-card-result"
                  onClick={() => openEditStarModal('result')}
                  className="group bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[140px]"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-8 -mt-8 opacity-20 pointer-events-none" />
                  <div>
                    <span className="inline-block text-xs font-black px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-md mb-3 border border-emerald-100">
                      R · Result (나타난 수치 성과 및 배운 점)
                    </span>
                    <p className="text-sm font-medium text-slate-700 leading-relaxed pl-1 line-clamp-4">
                      {currentProject.starData.result || "기입된 성공 결과가 공란 상태입니다."}
                    </p>
                  </div>
                  <div className="flex justify-end mt-4">
                    <span className="text-xs font-bold text-slate-400 group-hover:text-blue-500 flex items-center gap-1 transition-colors">
                      <Edit3 className="w-3.5 h-3.5" /> 세부 교정하기
                    </span>
                  </div>
                </div>

              </div>

              {/* Navigation Options & Cover Letter matching info */}
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-6 mt-4">
                <h4 className="font-bold text-slate-900 text-sm mb-4">✍🏻 생성 조건 설정 (자소서 매칭)</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  
                  {/* Target Question Selection */}
                  <div className="md:col-span-8 space-y-3">
                    <label className="block text-xs font-bold text-slate-700 uppercase">자소서 지원 문항 번호 / 질문 내용</label>
                    
                    {/* Presets List */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {QUESTION_PRESETS.map((qText, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleUpdateField('question', qText)}
                          className={`text-2xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                            currentProject.question === qText 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          자주 묻는 문항 {idx + 1}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={3}
                      value={currentProject.question}
                      onChange={(e) => handleUpdateField('question', e.target.value)}
                      className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-hidden bg-white focus:border-blue-500"
                      placeholder="자소서 질문을 직접 상세히 붙여넣어 주세요."
                    />
                  </div>

                  {/* Length & Tone Options */}
                  <div className="md:col-span-4 gap-4 flex flex-col justify-between">
                    
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-bold text-slate-700 uppercase">목표 제한 글자수</label>
                        <span className="text-xs font-extrabold text-blue-600">{currentProject.targetLength}자</span>
                      </div>
                      
                      <input
                        type="range"
                        min="300"
                        max="1200"
                        step="50"
                        value={currentProject.targetLength}
                        onChange={(e) => handleUpdateField('targetLength', parseInt(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <div className="flex justify-between text-4xs font-bold text-slate-400 mt-1 uppercase">
                        <span>300자</span>
                        <span>550자</span>
                        <span>800자</span>
                        <span>1200자</span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-2">어조 및 톤앤매너</label>
                      <select
                        value={currentProject.tone}
                        onChange={(e) => handleUpdateField('tone', e.target.value)}
                        className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden"
                      >
                        {TONE_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id} title={preset.desc}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                  </div>

                </div>
              </div>

              {/* Launch 2차 AI Cover Letter Generation button */}
              <div className="flex justify-end mt-4">
                <button
                  id="trigger-letter-generation-btn"
                  onClick={handleGenerateCoverLetter}
                  disabled={isGeneratingCV}
                  className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 font-bold text-white text-base rounded-xl cursor-pointer shadow-lg hover:shadow-xl transition-all hover:scale-[1.01]"
                >
                  {isGeneratingCV ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      자소서 맞춤형 초안 집필 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-amber-300" />
                      2차 AI 자소서 치트키 발급받기
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>

            </motion.div>
          )}

          {/* ======================================================== */}
          {/* STEP 3: Beautiful Cover Letter Output Screen             */}
          {/* ======================================================== */}
          {activeStep === 'final' && currentProject && (
            <motion.div
              key="final-step"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              
              {/* Left Panel: Cover Letter Viewer Dashboard */}
              <div className="lg:col-span-8 space-y-6">
                
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                      🔑 합격 자소서 치트키 완성본
                    </h2>
                    <p className="text-slate-500 text-xs mt-1">
                      공백 제한 수치에 맞춰 완벽히 조도 조율되었으며, 바로 복사하여 자소서 탭에 활용하실 수 있습니다.
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveStep('star')}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-slate-200 bg-white rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> 뼈대 및 조건 수정
                    </button>
                  </div>
                </div>

                {/* Dynamic Content Panel */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                  
                  <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center">
                    <span className="text-xs font-extrabold flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400" />
                      {currentProject.companyName || "미명 기업"} - {currentProject.jobTitle || "희망 직무"} 자기소개서
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      최종 갱신: {new Date(currentProject.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="p-6 md:p-8 bg-slate-50 min-h-[350px] font-sans antialiased">
                    <textarea
                      id="cover-letter-final-textarea"
                      className="w-full min-h-[320px] bg-white border border-dashed border-slate-200 p-6 rounded-xl text-sm leading-relaxed text-slate-800 font-medium focus:outline-hidden resize-y focus:border-blue-500"
                      value={currentProject.generatedCoverLetter}
                      onChange={(e) => handleUpdateField('generatedCoverLetter', e.target.value)}
                    />
                  </div>

                  {/* Character Metrics footer */}
                  <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    
                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                      <div>
                        공백 포함: <span className="font-extrabold text-slate-900">{withSpace}자</span>
                      </div>
                      <div>
                        공백 제외: <span className="font-extrabold text-slate-900">{withoutSpace}자</span>
                      </div>
                      <div>
                        목표 자수: <span className="font-extrabold text-blue-600">{targetGoal}자</span>
                      </div>
                    </div>

                    {/* ±5% strict range confirmation bar */}
                    <div className="flex items-center gap-1.5">
                      {isOptimal ? (
                        <div className="flex items-center gap-1 text-2xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 animate-pulse">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          글자수 최적 범위 합격 (목표 대비 {Math.round((withSpace / targetGoal) * 100)}%)
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-2xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                          <AlertCircle className="w-3.5 h-3.5" />
                          목표 분량 범위 조정 중 ({withSpace}자)
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Floating controls */}
                <div className="flex flex-col sm:flex-row gap-3 justify-end items-center">
                  
                  <button
                    id="copy-clipboard-main-btn"
                    onClick={() => handleCopyToClipboard(currentProject.generatedCoverLetter)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-transform duration-100 active:scale-95"
                  >
                    {copied ? (
                      <>
                        <Check className="w-5 h-5 text-emerald-300" />
                        복사 완료!
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5" />
                        자기소개서 클립보드 복사
                      </>
                    )}
                  </button>

                  <button
                    id="download-doc-main-btn"
                    onClick={() => handleDownloadFile(currentProject)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-950 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md cursor-pointer transition-transform duration-100 active:scale-95"
                  >
                    <Download className="w-5 h-5" />
                    문서 파일(.txt) 반출 다운로드
                  </button>

                </div>

              </div>

              {/* Right Panel: STAR Logical verification report Card */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Embedded STAR summary board */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                  <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4.5 h-4.5 text-blue-600" />
                    매칭 구조화 검증 보고서
                  </h4>

                  <div className="space-y-4 text-xs">
                    <div>
                      <span className="block font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-sm mb-1.5">S · Situation</span>
                      <p className="text-slate-600 leading-relaxed max-h-24 overflow-y-auto pl-1">
                        {currentProject.starData.situation}
                      </p>
                    </div>

                    <div>
                      <span className="block font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-sm mb-1.5">T · Task</span>
                      <p className="text-slate-600 leading-relaxed max-h-24 overflow-y-auto pl-1">
                        {currentProject.starData.task}
                      </p>
                    </div>

                    <div>
                      <span className="block font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-sm mb-1.5">A · Action</span>
                      <p className="text-slate-600 leading-relaxed max-h-24 overflow-y-auto pl-1">
                        {currentProject.starData.action}
                      </p>
                    </div>

                    <div>
                      <span className="block font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-sm mb-1.5">R · Result</span>
                      <p className="text-slate-600 leading-relaxed max-h-24 overflow-y-auto pl-1">
                        {currentProject.starData.result}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Micro instructions */}
                <div className="bg-blue-50 text-blue-800 hover:bg-blue-100/50 transition-colors p-5 border border-blue-100 rounded-xl text-xs space-y-2">
                  <h5 className="font-bold flex items-center gap-1">
                    <Info className="w-4 h-4 shrink-0" />
                    컨설턴트의 최종 코멘트
                  </h5>
                  <p className="leading-relaxed">
                    본 글은 제출 기업의 지원 분야 요구 역량인 STAR 요소와 '{TONE_PRESETS.find(t => t.id === currentProject.tone)?.label}' 기법에 맞춰 제작되었습니다. 
                  </p>
                  <p className="leading-relaxed">
                    글자수인 <strong>{withSpace}자</strong>는 매칭 목표이신 {targetGoal}자 기준 성공 요건을 아주 잘 충족합니다. 세세한 오타 등이 없는지 소리 내어 확인하신 뒤 제출해 주시기 바랍니다.
                  </p>
                </div>

              </div>

            </motion.div>
          )}

        </AnimatePresence>

      </main>

      {/* --- Global Action-driven Editing Modal for STAR Bento part --- */}
      <AnimatePresence>
        {editingStarKey && currentProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col justify-between"
            >
              
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
                <span className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-blue-400" />
                  {editingStarKey.toUpperCase()} 영역 세부 조정
                </span>
                <button
                  onClick={() => setEditingStarKey(null)}
                  className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
                >
                  닫기
                </button>
              </div>

              <div className="p-6 space-y-4">
                <label className="block text-xs font-extrabold text-slate-500 uppercase">
                  {editingStarKey === 'situation' && 'S · Situation (상황 전개의 배경, 해결 과제가 불거지게 된 근본 기회)'}
                  {editingStarKey === 'task' && 'T · Task (나의 목표, 해결해야 했던 당장의 정량 정성적 기준치)'}
                  {editingStarKey === 'action' && 'A · Action (내가 전문성이나 극복 솔루션을 구사해 취했던 구체 행적)'}
                  {editingStarKey === 'result' && 'R · Result (액션으로 인해 도출된 명확한 수량화 지표 및 획득한 레슨런)'}
                </label>
                
                <p className="text-3xs font-medium text-slate-400 leading-normal">
                  * <strong>숫자나 상세 툴 정보</strong>를 추가할수록 자기소개서 내용의 해상도가 높아져 서합률이 폭발적으로 올라갑니다.
                </p>

                <textarea
                  rows={6}
                  value={starEditText}
                  onChange={(e) => setStarEditText(e.target.value)}
                  className="w-full p-4 text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-500 font-sans leading-relaxed"
                  placeholder="구체적인 사실 중심으로 문장을 보강하세요."
                />
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStarKey(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveStarModifications}
                  className="px-4.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> 저장 및 적용
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Global Interactive Alert Toast --- */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm w-full"
          >
            <div className={`p-4 rounded-xl shadow-lg border flex gap-3 items-start ${
              alertMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              alertMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
              'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              {alertMsg.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : alertMsg.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-bold leading-normal">
                {alertMsg.text}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Footer Signature --- */}
      <footer id="main-signature-footer" className="bg-white border-t border-slate-100 py-6 text-center text-slate-400 text-xs font-medium">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 자소서 치트키 (CheatKey) App. All Rights Reserved.</p>
          <p className="mt-1 text-2xs text-slate-300">내 손안의 1급 채용 AI 비서실 🔑</p>
        </div>
      </footer>

    </div>
  );
}
