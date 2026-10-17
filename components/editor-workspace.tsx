"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Check, CircleHelp, FileText, LoaderCircle, RotateCcw, ScanText, Sparkles, WandSparkles, X } from "lucide-react";
import type { AnalysisResult, RevisionResult } from "@/lib/analysis/contracts";

const MAX_CHARACTERS = 12_000;

function fallbackMessage(status: number): string {
  if (status === 413) return "請求內容過大，請縮短文字後再試。";
  if (status === 429) return "請求過於頻繁或配額已滿，請稍後再試。";
  if (status === 504) return "服務逾時，請稍後再試。";
  if (status === 503) return "服務尚未完成設定或暫時無法使用，請稍後再試。";
  return "請求失敗，請稍後重試。";
}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let result: { error?: string } = {};
  try {
    result = (await response.json()) as { error?: string };
  } catch {
    // 平台或代理的非 JSON 錯誤頁：不把内部細節顯示給使用者。
  }
  if (!response.ok) throw new Error(result.error ?? fallbackMessage(response.status));
  return result as T;
}

export default function EditorWorkspace() {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [revision, setRevision] = useState<RevisionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const characterCount = Array.from(text).length;
  const canSubmit = characterCount >= 80 && characterCount <= MAX_CHARACTERS;

  function runRequest<T>(url: string, setResult: (value: T) => void) {
    setError("");
    startTransition(async () => {
      try {
        setResult(await requestJson<T>(url, { text }));
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "請求失敗，請稍後重試。");
      }
    });
  }

  function reset() {
    setText("");
    setAnalysis(null);
    setRevision(null);
    setError("");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link aria-label="字間首頁" className="brand" href="/"><span className="brand-mark"><ScanText size={19} strokeWidth={2.2} /></span><span>字間<span className="brand-period">.</span></span></Link>
        <div className="topbar-note"><span className="status-dot" />私人工作階段 <span className="topbar-divider">/</span> 不保存文章</div>
        <a className="method-link" href="#limits"><CircleHelp size={16} /> 方法與限制</a>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <div className="eyebrow"><span>文字觀察室</span><span className="eyebrow-line" /></div>
        <div className="intro-row"><div><h1 id="page-title">看見文字的<span>紋理。</span></h1><p className="intro-copy">整理寫作訊號，找到可以更清楚表達的地方。判讀始終留給你。</p></div><div className="intro-index" aria-hidden="true"><span>FIELD NOTE</span><strong>01</strong><small>ZH / EDITION</small></div></div>
      </section>

      <section className="workspace" aria-label="文章分析工作區">
        <div className="compose-column">
          <div className="section-heading"><div className="section-title"><span className="step-number">01</span><h2>放入一段文字</h2></div><span className="input-kind"><FileText size={14} /> 純文字</span></div>
          <div className="editor-wrap">
            <label className="sr-only" htmlFor="source-text">待分析文章</label>
            <textarea id="source-text" maxLength={MAX_CHARACTERS} onChange={(event) => { setText(event.target.value); setAnalysis(null); setRevision(null); }} placeholder="貼上文章或段落……\n\n目前支援直接貼上文字，檔案匯入尚未開放。建議至少 80 個字，較長文本也不代表分析一定準確。" value={text} />
            <div className="editor-footer"><span className={characterCount > MAX_CHARACTERS - 500 ? "count count-warning" : "count"}>{characterCount.toLocaleString("zh-TW")} <span>/ {MAX_CHARACTERS.toLocaleString("zh-TW")} 字</span></span><button aria-label="清空文字" className="icon-button" disabled={!text || busy} onClick={reset} title="清空文字" type="button"><RotateCcw size={16} /></button></div>
          </div>
          <div className="action-row"><button className="primary-button" disabled={!canSubmit || busy} onClick={() => { setRevision(null); runRequest("/api/analyze", setAnalysis); }} type="button">{busy ? <LoaderCircle className="spin" size={17} /> : <ScanText size={17} />}分析文字訊號 <ArrowRight size={16} /></button><span className="minimum-note">至少 80 字 · 最多 12,000 字</span></div>
          <div className="privacy-note"><span className="privacy-lock">◎</span><p>文章僅用於本次請求，不會儲存。請避免貼上含有個人或機密資訊的內容。</p></div>
          <div className="edit-section">
            <div className="section-heading edit-heading"><div className="section-title"><span className="step-number">02</span><h2>編輯建議</h2></div><span className="edit-caption">保留原意，由你決定</span></div>
            <div className="edit-prompt-row"><div className="edit-prompt"><Sparkles size={17} /><span>改善清晰度、連貫性與文法</span></div><button className="secondary-button" disabled={!canSubmit || busy} onClick={() => runRequest("/api/revise", setRevision)} type="button"><WandSparkles size={16} />提出修改</button></div>
          </div>
        </div>

        <aside className="results-column" aria-live="polite">
          <div className="section-heading result-heading"><div className="section-title"><span className="step-number">03</span><h2>觀察結果</h2></div>{analysis && <span className="result-time">本次分析</span>}</div>
          {error && <div className="error-banner" role="alert"><X size={17} /><span>{error}</span></div>}
          {analysis ? <AnalysisPanel analysis={analysis} /> : <div className="empty-state"><div className="empty-mark"><ScanText size={25} strokeWidth={1.4} /></div><p className="empty-kicker">等待一段文字</p><h3>先觀察，再判斷。</h3><p className="empty-copy">分析結果會整理模型觀察與可量化的文本特徵。這些訊號不能證明作者是人或 AI。</p><div className="empty-rule" /><div className="empty-foot"><span>WORDS ARE NOT EVIDENCE</span><span>—</span></div></div>}
          {revision && <section className="revision-panel" aria-label="修改前後比較"><div className="revision-title"><div><span className="step-number">EDIT</span><h3>建議版本</h3></div><span className="review-tag">待你確認</span></div><p className="revision-text">{revision.revisedText}</p>{revision.changes.length > 0 && <ul className="change-list">{revision.changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}</ul>}<div className="revision-actions"><button className="primary-button accept-button" onClick={() => { setText(revision.revisedText); setAnalysis(null); setRevision(null); setError(""); }} type="button"><Check size={16} />採用這個版本</button><button aria-label="捨棄建議" className="icon-button" onClick={() => setRevision(null)} title="捨棄建議" type="button"><X size={16} /></button></div></section>}
        </aside>
      </section>

      <section className="limits-section" id="limits"><div className="limits-title"><span className="step-number">NOTE</span><h2>讀取結果時，請留意</h2></div><div className="limits-grid"><article><span className="limit-index">A</span><h3>不是作者鑑定</h3><p>文字訊號分數不是作者身分的機率，也不能證明文章由誰撰寫。</p></article><article><span className="limit-index">B</span><h3>特徵沒有定論</h3><p>詞彙、句長與重複模式受題材、語言和個人習慣影響，不能單獨作為證據。</p></article><article><span className="limit-index">C</span><h3>不推測寫作速度</h3><p>無法從貼上的文字推斷寫作歷程或速度；本工具也不收集鍵入時間。</p></article></div></section>
      <footer className="page-footer"><Link className="footer-brand" href="/">字間<span>.</span></Link><span>讓觀察保持謙遜，讓作者保有主導。</span><a className="footer-top" href="#page-title">回到頂部 <ArrowDownToLine size={14} /></a></footer>
    </main>
  );
}

function AnalysisPanel({ analysis }: { analysis: AnalysisResult }) {
  return <div className="analysis-panel"><div className="score-block"><div className="score-label">模型訊號指數 <span>非機率</span></div><div className="score-line"><strong>{analysis.signalIndex}</strong><span>/ 100</span><div className="score-meter" aria-label={`模型訊號指數 ${analysis.signalIndex} / 100`}><i style={{ width: `${analysis.signalIndex}%` }} /></div></div><p className="score-caveat">未經校準的模型估計，不代表 AI 生成比例。</p></div><p className="analysis-summary">{analysis.summary}</p><div className="metrics-heading"><h3>文本特徵</h3><span>可計算的描述性統計</span></div><div className="metrics-grid"><Metric label="字元數" value={analysis.metrics.characterCount.toLocaleString("zh-TW")} /><Metric label="句子數" value={analysis.metrics.sentenceCount.toLocaleString("zh-TW")} /><Metric label="平均句長" value={`${analysis.metrics.averageSentenceLength} 字`} /></div>{analysis.metrics.repeatedTerms.length > 0 && <div className="terms-row"><span>重複詞</span><div>{analysis.metrics.repeatedTerms.map((term) => <span className="term" key={term.term}>{term.term}<small>{term.count}</small></span>)}</div></div>}<div className="observations-heading"><h3>模型觀察</h3><span>需結合上下文閱讀</span></div><div className="observations-list">{analysis.observations.map((observation, index) => <article className="observation" key={`${index}-${observation.label}`}><span className={`observation-mark ${observation.strength}`} /><div><h4>{observation.label}</h4><p>{observation.explanation}</p>{observation.quote && <blockquote>「{observation.quote}」</blockquote>}</div></article>)}</div><p className="result-disclaimer">{analysis.disclaimer}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}