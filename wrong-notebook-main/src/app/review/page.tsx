"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowLeft, Clock, CheckCircle2, XCircle, ChevronRight, BookOpen, AlertCircle, Brain, Award, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { frontendLogger } from "@/lib/frontend-logger";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface ReviewScheduleItem {
    id: string;
    errorItemId: string;
    scheduledFor: string;
    phase?: string; // "normal" | "verification"
    errorItem: {
        id: string;
        questionText?: string | null;
        answerText?: string | null;
        analysis?: string | null;
        originalImageUrl: string;
        masteryLevel: number;
        verificationRequired?: boolean;
        subject?: { id: string; name: string } | null;
        tags?: Array<{ id: string; name: string }> | null;
    };
}

interface TodayReviewData {
    schedules: ReviewScheduleItem[];
    total: number;
}

interface ReviewStatsData {
    todayPending: number;
    todayCompleted: number;
    totalScheduled: number;
    totalCompleted: number;
    completionRate: string;
    upcomingSchedules: Array<{
        id: string;
        errorItemId: string;
        scheduledFor: string;
        errorItem: {
            id: string;
            questionText?: string | null;
            subject?: { id: string; name: string } | null;
        };
    }>;
}

export default function ReviewScreen() {
    const router = useRouter();
    const { t, language } = useLanguage();
    const [todayReview, setTodayReview] = useState<TodayReviewData | null>(null);
    const [reviewStats, setReviewStats] = useState<ReviewStatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [completingId, setCompletingId] = useState<string | null>(null);
    
    // 验证阶段弹窗状态
    const [showVerificationDialog, setShowVerificationDialog] = useState(false);
    const [showDismissDialog, setShowDismissDialog] = useState(false);
    const [verificationScheduleId, setVerificationScheduleId] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<{
        passed: boolean;
        message: string;
    } | null>(null);

    useEffect(() => {
        Promise.all([
            apiClient.get<TodayReviewData>("/api/review-schedule?action=today").catch(() => null),
            apiClient.get<ReviewStatsData>("/api/review-schedule?action=stats").catch(() => null),
        ]).then(([today, stats]) => {
            if (today) setTodayReview(today);
            if (stats) setReviewStats(stats);
            setLoading(false);
        }).catch(err => {
            console.error("Failed to fetch review data:", err);
            setLoading(false);
        });
    }, []);

    // 检查 URL 参数中是否有验证结果
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const result = params.get('verificationResult');
        const errorMsg = params.get('errorMsg');
        
        if (result === 'passed') {
            setLastResult({ passed: true, message: errorMsg || '验证通过，题目已标记为掌握！' });
            setShowDismissDialog(true);
            // 清除 URL 参数
            window.history.replaceState({}, '', window.location.pathname);
        } else if (result === 'failed') {
            setLastResult({ passed: false, message: errorMsg || '验证未通过，已加入复习计划' });
            setShowDismissDialog(true);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    const handleCompleteReview = async (scheduleId: string, isCorrect: boolean) => {
        try {
            setCompletingId(scheduleId);
            frontendLogger.info('[ReviewComplete]', 'Marking review as complete', {
                scheduleId,
                isCorrect,
            });

            const response: any = await apiClient.post("/api/review-schedule/complete", {
                scheduleId,
                isCorrect,
            });

            // 检查是否需要验证
            if (response?.needsVerification) {
                setShowVerificationDialog(true);
                setVerificationScheduleId(scheduleId);
                // 从列表中移除当前项目（验证计划稍后会出现在列表中）
                if (todayReview) {
                    const updatedSchedules = todayReview.schedules.filter(s => s.id !== scheduleId);
                    setTodayReview({
                        ...todayReview,
                        schedules: updatedSchedules,
                        total: updatedSchedules.length,
                    });
                }
                if (reviewStats) {
                    setReviewStats({
                        ...reviewStats,
                        todayPending: Math.max(0, reviewStats.todayPending - 1),
                        todayCompleted: reviewStats.todayCompleted + 1,
                    });
                }
            } else {
                // Update local state
                if (todayReview) {
                    const updatedSchedules = todayReview.schedules.filter(s => s.id !== scheduleId);
                    setTodayReview({
                        ...todayReview,
                        schedules: updatedSchedules,
                        total: updatedSchedules.length,
                    });
                }

                if (reviewStats) {
                    setReviewStats({
                        ...reviewStats,
                        todayPending: Math.max(0, reviewStats.todayPending - 1),
                        todayCompleted: reviewStats.todayCompleted + 1,
                    });
                }
            }

            frontendLogger.info('[ReviewComplete]', 'Review marked as complete successfully');
        } catch (error) {
            frontendLogger.error('[ReviewError]', 'Failed to complete review', {
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setCompletingId(null);
        }
    };

    const handleStartVerification = () => {
        setShowVerificationDialog(false);
        // 跳转到练习页面进行验证
        router.push("/practice");
    };

    const handleBackToHome = () => {
        router.push("/");
    };

    const handleGenerateSchedules = async () => {
        try {
            frontendLogger.info('[ReviewGenerate]', 'Generating review schedules for all error items');
            await apiClient.post("/api/review-schedule?action=generate", {});
            // Refresh data
            const [today, stats] = await Promise.all([
                apiClient.get<TodayReviewData>("/api/review-schedule?action=today").catch(() => null),
                apiClient.get<ReviewStatsData>("/api/review-schedule?action=stats").catch(() => null),
            ]);
            if (today) setTodayReview(today);
            if (stats) setReviewStats(stats);
            frontendLogger.info('[ReviewGenerate]', 'Review schedules generated successfully');
        } catch (error) {
            frontendLogger.error('[ReviewError]', 'Failed to generate review schedules', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-4 text-muted-foreground">{t.common?.loading || "加载中..."}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                <div className="container mx-auto p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleBackToHome}
                            className="rounded-full"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold">{t.app?.reviewSchedule || "智能复习"}</h1>
                            <p className="text-sm text-muted-foreground">
                                {reviewStats ? `${reviewStats.todayPending} 待复习 · ${reviewStats.todayCompleted} 已完成` : "加载中..."}
                            </p>
                        </div>
                    </div>
                    {reviewStats && (
                        <div className="text-right">
                            <div className="text-sm font-medium">
                                完成率: {reviewStats.completionRate}%
                            </div>
                            <div className="text-xs text-muted-foreground">
                                总计: {reviewStats.totalScheduled} 题
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="container mx-auto p-4 space-y-6">
                {/* Stats Cards */}
                {reviewStats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-card p-4 rounded-lg border shadow-sm">
                            <div className="flex items-center gap-2 text-destructive">
                                <AlertCircle className="h-5 w-5" />
                                <span className="text-2xl font-bold">{reviewStats.todayPending}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">今日待复习</p>
                        </div>
                        <div className="bg-card p-4 rounded-lg border shadow-sm">
                            <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="text-2xl font-bold">{reviewStats.todayCompleted}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">今日已完成</p>
                        </div>
                        <div className="bg-card p-4 rounded-lg border shadow-sm">
                            <div className="flex items-center gap-2 text-blue-600">
                                <Clock className="h-5 w-5" />
                                <span className="text-2xl font-bold">{reviewStats.totalScheduled}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">总复习计划</p>
                        </div>
                        <div className="bg-card p-4 rounded-lg border shadow-sm">
                            <div className="flex items-center gap-2 text-purple-600">
                                <BookOpen className="h-5 w-5" />
                                <span className="text-2xl font-bold">{reviewStats.totalCompleted}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">总已完成</p>
                        </div>
                    </div>
                )}

                {/* Today's Reviews */}
                {todayReview && todayReview.total > 0 ? (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            今日待复习 ({todayReview.total})
                        </h2>
                        <div className="space-y-4">
                            {todayReview.schedules.map((schedule) => {
                                const isVerification = schedule.phase === 'verification';
                                const isMastered = schedule.errorItem.masteryLevel >= 2;
                                
                                return (
                                    <div
                                        key={schedule.id}
                                        className={`rounded-lg border shadow-sm p-4 space-y-3 ${
                                            isVerification 
                                                ? 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800' 
                                                : isMastered
                                                    ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                                                    : 'bg-card'
                                        }`}
                                    >
                                        {/* Subject Badge */}
                                        {schedule.errorItem.subject && (
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                                    {schedule.errorItem.subject.name}
                                                </span>
                                                {isVerification && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">
                                                        <Brain className="h-3 w-3 mr-1" />
                                                        验证阶段
                                                    </span>
                                                )}
                                                {isMastered && !isVerification && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600">
                                                        <Award className="h-3 w-3 mr-1" />
                                                        已掌握
                                                    </span>
                                                )}
                                                {schedule.errorItem.tags && schedule.errorItem.tags.length > 0 && (
                                                    <div className="flex gap-1">
                                                        {schedule.errorItem.tags.slice(0, 3).map((tag) => (
                                                            <span
                                                                key={tag.id}
                                                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                                                            >
                                                                {tag.name}
                                                            </span>
                                                        ))}
                                                        {schedule.errorItem.tags.length > 3 && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                                                +{schedule.errorItem.tags.length - 3}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Question Text */}
                                        {schedule.errorItem.questionText && (
                                            <div className="rounded-lg bg-background/50 p-3 border">
                                                <MarkdownRenderer content={schedule.errorItem.questionText} />
                                            </div>
                                        )}

                                        {/* Image */}
                                        {schedule.errorItem.originalImageUrl && (
                                            <div className="rounded-lg overflow-hidden border">
                                                <img
                                                    src={schedule.errorItem.originalImageUrl}
                                                    alt="错题图片"
                                                    className="w-full h-auto object-contain"
                                                />
                                            </div>
                                        )}

                                        {/* Answer and Analysis */}
                                        {(schedule.errorItem.answerText || schedule.errorItem.analysis) && (
                                            <div className="space-y-2 text-sm">
                                                {schedule.errorItem.answerText && (
                                                    <div>
                                                        <span className="font-medium text-primary">答案：</span>
                                                        <div className="mt-1">
                                                            <MarkdownRenderer content={schedule.errorItem.answerText} />
                                                        </div>
                                                    </div>
                                                )}
                                                {schedule.errorItem.analysis && (
                                                    <div>
                                                        <span className="font-medium text-primary">解析：</span>
                                                        <div className="mt-1">
                                                            <MarkdownRenderer content={schedule.errorItem.analysis} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-2 pt-2">
                                            {isVerification ? (
                                                // 验证阶段：显示验证相关按钮
                                                <>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => handleCompleteReview(schedule.id, false)}
                                                        disabled={completingId === schedule.id}
                                                    >
                                                        <ShieldAlert className="h-4 w-4 mr-2" />
                                                        还未掌握
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => handleCompleteReview(schedule.id, true)}
                                                        disabled={completingId === schedule.id}
                                                    >
                                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                                        已通过
                                                    </Button>
                                                </>
                                            ) : (
                                                // 正常复习阶段
                                                <>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => handleCompleteReview(schedule.id, false)}
                                                        disabled={completingId === schedule.id}
                                                    >
                                                        <XCircle className="h-4 w-4 mr-2" />
                                                        还需努力
                                                    </Button>
                                                    <Button
                                                        variant={isMastered ? "default" : "default"}
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => handleCompleteReview(schedule.id, true)}
                                                        disabled={completingId === schedule.id}
                                                    >
                                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                                        {isMastered ? "验证掌握" : "已掌握"}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 space-y-4">
                        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                        <h2 className="text-xl font-semibold">今日复习已完成！</h2>
                        <p className="text-muted-foreground">
                            继续保持，明天再来复习吧！
                        </p>
                        <Button onClick={handleBackToHome}>
                            返回首页
                        </Button>
                    </div>
                )}

                {/* Upcoming Reviews */}
                {reviewStats && reviewStats.upcomingSchedules && reviewStats.upcomingSchedules.length > 0 && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Clock className="h-5 w-5 text-muted-foreground" />
                            未来7天复习计划
                        </h2>
                        <div className="space-y-2">
                            {reviewStats.upcomingSchedules.map((schedule) => (
                                <Link
                                    key={schedule.id}
                                    href={`/error-items/${schedule.errorItemId}`}
                                    className="block bg-card rounded-lg border p-3 hover:border-primary/50 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {schedule.errorItem.questionText || "查看错题详情"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(schedule.scheduledFor).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* 验证提示弹窗 */}
            <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Brain className="h-5 w-5 text-amber-500" />
                            {t.practice?.verificationTitle || "验证掌握"}
                        </DialogTitle>
                        <DialogDescription>
                            {language === 'en' 
                                ? "This item has reached mastery standard. Please complete a variation exercise to verify your understanding."
                                : "此题已达到掌握标准，请完成一道变式题来验证你是否真正掌握。"
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowVerificationDialog(false)}>
                            {t.common?.cancel || "取消"}
                        </Button>
                        <Button onClick={handleStartVerification}>
                            {t.practice?.startPractice || "开始练习"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 验证结果弹窗 */}
            <Dialog open={showDismissDialog} onOpenChange={setShowDismissDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {lastResult?.passed ? (
                                <>
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    {t.practice?.verificationSuccess || "验证通过！"}
                                </>
                            ) : (
                                <>
                                    <XCircle className="h-5 w-5 text-red-500" />
                                    {t.practice?.verificationFailed || "验证未通过"}
                                </>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {lastResult?.message}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={handleBackToHome}>
                            {t.common?.back || "返回"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}