import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { subDays, startOfDay, endOfDay, format, addDays } from "date-fns";
import { createLogger } from "@/lib/logger";
import { unauthorized, internalError } from "@/lib/api-errors";

const logger = createLogger('api:review-schedule');

/**
 * SM-2 Algorithm for calculating next review interval
 * Based on the user's performance, adjusts the review schedule
 */
function calculateNextReview(
    currentInterval: number,
    currentEase: number,
    currentStage: number,
    isCorrect: boolean
): { interval: number; ease: number; stage: number } {
    if (!isCorrect) {
        // If incorrect, reset to stage 1 with 1-day interval
        return {
            interval: 1,
            ease: Math.max(1.3, currentEase - 0.2),
            stage: 1,
        };
    }

    // Calculate new ease factor (simplified SM-2)
    const newEase = currentEase + 0.1;
    
    // Calculate new interval based on stage
    let newInterval: number;
    switch (currentStage) {
        case 0:
            newInterval = 1; // First review after 1 day
            break;
        case 1:
            newInterval = 2; // Second review after 2 days
            break;
        case 2:
            newInterval = 4; // Third review after 4 days
            break;
        case 3:
            newInterval = 7; // Fourth review after 7 days
            break;
        case 4:
            newInterval = 15; // Fifth review after 15 days
            break;
        case 5:
            newInterval = 30; // Sixth review after 30 days
            break;
        default:
            newInterval = Math.round(currentInterval * newEase);
    }

    return {
        interval: newInterval,
        ease: Math.min(3.0, newEase),
        stage: Math.min(6, currentStage + 1),
    };
}

/**
 * GET /api/review-schedule?action=today
 * 获取今日待复习的错题
 */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    // @ts-ignore
    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    try {
        if (action === 'today') {
            // 获取今日待复习的错题
            const today = startOfDay(new Date());
            const tomorrow = endOfDay(new Date());

            const todaySchedules = await prisma.reviewSchedule.findMany({
                where: {
                    errorItem: {
                        userId,
                    },
                    scheduledFor: {
                        gte: today,
                        lte: tomorrow,
                    },
                    completedAt: null,
                },
                include: {
                    errorItem: {
                        include: {
                            subject: true,
                            tags: true,
                        },
                    },
                },
                orderBy: {
                    scheduledFor: 'asc',
                },
            });

            return Response.json({
                schedules: todaySchedules.map(schedule => ({
                    id: schedule.id,
                    errorItemId: schedule.errorItemId,
                    scheduledFor: schedule.scheduledFor,
                    phase: schedule.phase,
                    errorItem: {
                        id: schedule.errorItem.id,
                        questionText: schedule.errorItem.questionText,
                        answerText: schedule.errorItem.answerText,
                        analysis: schedule.errorItem.analysis,
                        originalImageUrl: schedule.errorItem.originalImageUrl,
                        masteryLevel: schedule.errorItem.masteryLevel,
                        verificationRequired: schedule.errorItem.verificationRequired,
                        subject: schedule.errorItem.subject,
                        tags: schedule.errorItem.tags,
                    },
                })),
                total: todaySchedules.length,
            });
        }

        if (action === 'stats') {
            // 获取复习统计数据
            const today = startOfDay(new Date());
            const tomorrow = endOfDay(new Date());
            const thirtyDaysAgo = subDays(today, 30);

            const [todayCount, completedToday, totalScheduled, totalCompleted, upcoming7Days] = await Promise.all([
                prisma.reviewSchedule.count({
                    where: {
                        errorItem: { userId },
                        scheduledFor: {
                            gte: today,
                            lte: tomorrow,
                        },
                        completedAt: null,
                    },
                }),
                prisma.reviewSchedule.count({
                    where: {
                        errorItem: { userId },
                        scheduledFor: {
                            gte: today,
                            lte: tomorrow,
                        },
                        completedAt: {
                            not: null,
                        },
                    },
                }),
                prisma.reviewSchedule.count({
                    where: {
                        errorItem: { userId },
                    },
                }),
                prisma.reviewSchedule.count({
                    where: {
                        errorItem: { userId },
                        completedAt: {
                            not: null,
                        },
                    },
                }),
                prisma.reviewSchedule.findMany({
                    where: {
                        errorItem: { userId },
                        scheduledFor: {
                            gte: today,
                            lte: addDays(today, 7),
                        },
                        completedAt: null,
                    },
                    include: {
                        errorItem: {
                            include: {
                                subject: true,
                            },
                        },
                    },
                    orderBy: {
                        scheduledFor: 'asc',
                    },
                    take: 10,
                }),
            ]);

            return Response.json({
                todayPending: todayCount,
                todayCompleted: completedToday,
                totalScheduled,
                totalCompleted,
                completionRate: totalScheduled > 0 ? ((totalCompleted / totalScheduled) * 100).toFixed(1) : '0',
                upcomingSchedules: upcoming7Days.map(schedule => ({
                    id: schedule.id,
                    errorItemId: schedule.errorItemId,
                    scheduledFor: schedule.scheduledFor,
                    errorItem: {
                        id: schedule.errorItem.id,
                        questionText: schedule.errorItem.questionText,
                        subject: schedule.errorItem.subject,
                    },
                })),
            });
        }

        if (action === 'upcoming') {
            // 获取未来7天的复习计划
            const today = startOfDay(new Date());
            const weekLater = endOfDay(addDays(today, 7));

            const upcomingSchedules = await prisma.reviewSchedule.findMany({
                where: {
                    errorItem: {
                        userId,
                    },
                    scheduledFor: {
                        gte: today,
                        lte: weekLater,
                    },
                    completedAt: null,
                },
                include: {
                    errorItem: {
                        include: {
                            subject: true,
                            tags: true,
                        },
                    },
                },
                orderBy: {
                    scheduledFor: 'asc',
                },
            });

            return Response.json({
                schedules: upcomingSchedules.map(schedule => ({
                    id: schedule.id,
                    errorItemId: schedule.errorItemId,
                    scheduledFor: schedule.scheduledFor,
                    errorItem: {
                        id: schedule.errorItem.id,
                        questionText: schedule.errorItem.questionText,
                        answerText: schedule.errorItem.answerText,
                        analysis: schedule.errorItem.analysis,
                        originalImageUrl: schedule.errorItem.originalImageUrl,
                        masteryLevel: schedule.errorItem.masteryLevel,
                        subject: schedule.errorItem.subject,
                        tags: schedule.errorItem.tags,
                    },
                })),
                total: upcomingSchedules.length,
            });
        }

        // 默认返回所有未完成的复习计划
        const allSchedules = await prisma.reviewSchedule.findMany({
            where: {
                errorItem: {
                    userId,
                },
                completedAt: null,
            },
            include: {
                errorItem: {
                    include: {
                        subject: true,
                        tags: true,
                    },
                },
            },
            orderBy: {
                scheduledFor: 'asc',
            },
        });

        return Response.json({
            schedules: allSchedules.map(schedule => ({
                id: schedule.id,
                errorItemId: schedule.errorItemId,
                scheduledFor: schedule.scheduledFor,
                errorItem: {
                    id: schedule.errorItem.id,
                    questionText: schedule.errorItem.questionText,
                    answerText: schedule.errorItem.answerText,
                    analysis: schedule.errorItem.analysis,
                    originalImageUrl: schedule.errorItem.originalImageUrl,
                    masteryLevel: schedule.errorItem.masteryLevel,
                    subject: schedule.errorItem.subject,
                    tags: schedule.errorItem.tags,
                },
            })),
            total: allSchedules.length,
        });

    } catch (error) {
        logger.error({ error }, 'Error fetching review schedules');
        return internalError("Failed to fetch review schedules");
    }
}

/**
 * POST /api/review-schedule?action=generate
 * 为所有未设置复习计划的错题生成复习计划
 */
async function GENERATE_POST(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    // @ts-ignore
    const userId = session.user.id;

    try {
        // 查找所有没有复习计划的错题
        const errorItemsWithoutSchedule = await prisma.errorItem.findMany({
            where: {
                userId,
                reviewSchedules: {
                    none: {},
                },
            },
            select: {
                id: true,
                createdAt: true,
            },
        });

        let generatedCount = 0;

        for (const item of errorItemsWithoutSchedule) {
            // 为每个错题生成6个复习节点
            const intervals = [1, 2, 4, 7, 15, 30];
            
            for (const daysAfter of intervals) {
                const scheduledFor = new Date(item.createdAt);
                scheduledFor.setDate(scheduledFor.getDate() + daysAfter);

                await prisma.reviewSchedule.create({
                    data: {
                        errorItemId: item.id,
                        scheduledFor,
                    },
                });
                generatedCount++;
            }
        }

        // 同时也为新添加的错题生成复习计划（如果它们还没有的话）
        const errorItemsWithFutureSchedules = await prisma.errorItem.findMany({
            where: {
                userId,
                reviewSchedules: {
                    none: {
                        completedAt: null,
                    },
                },
            },
            select: {
                id: true,
                createdAt: true,
            },
        });

        for (const item of errorItemsWithFutureSchedules) {
            const intervals = [1, 2, 4, 7, 15, 30];
            
            for (const daysAfter of intervals) {
                const scheduledFor = new Date(item.createdAt);
                scheduledFor.setDate(scheduledFor.getDate() + daysAfter);

                // 检查是否已存在
                const existing = await prisma.reviewSchedule.findFirst({
                    where: {
                        errorItemId: item.id,
                        scheduledFor,
                        completedAt: null,
                    },
                });

                if (!existing) {
                    await prisma.reviewSchedule.create({
                        data: {
                            errorItemId: item.id,
                            scheduledFor,
                        },
                    });
                    generatedCount++;
                }
            }
        }

        return Response.json({
            success: true,
            generatedCount,
            message: `Generated ${generatedCount} review schedules`,
        });

    } catch (error) {
        logger.error({ error }, 'Error generating review schedules');
        return internalError("Failed to generate review schedules");
    }
}

/**
 * POST /api/review-schedule/complete
 * 标记某个复习任务为已完成
 * 
 * 新逻辑（方案C - SM-2 扩展方案）：
 * - 当 masteryLevel < 2 时：正常复习流程
 * - 当 masteryLevel >= 2 且 isCorrect=true 时：进入验证阶段（需要举一反三验证）
 * - 当 masteryLevel >= 2 且进入验证阶段后：
 *   - 验证答对 → 标记为真正掌握 (masteryLevel = 3)
 *   - 验证答错 → 回到复习流程 (masteryLevel = 1)
 */
async function COMPLETE_POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    // @ts-ignore
    const userId = session.user.id;

    try {
        const body = await req.json();
        const { scheduleId, isCorrect } = body;

        if (!scheduleId) {
            return Response.json(
                { error: 'scheduleId is required' },
                { status: 400 }
            );
        }

        // 验证该复习计划属于当前用户
        const schedule = await prisma.reviewSchedule.findFirst({
            where: {
                id: scheduleId,
                errorItem: {
                    userId,
                },
            },
            include: {
                errorItem: true,
            },
        });

        if (!schedule) {
            return Response.json(
                { error: 'Review schedule not found' },
                { status: 404 }
            );
        }

        const errorItem = schedule.errorItem;
        const currentPhase = schedule.phase || 'normal';
        const currentMastery = errorItem.masteryLevel || 0;

        // 更新复习计划
        const updatedSchedule = await prisma.reviewSchedule.update({
            where: {
                id: scheduleId,
            },
            data: {
                completedAt: new Date(),
                isCorrect,
            },
            include: {
                errorItem: {
                    include: {
                        subject: true,
                    },
                },
            },
        });

        // 处理验证阶段逻辑
        if (currentPhase === 'verification') {
            // 这是验证阶段的答题
            if (isCorrect === true) {
                // 验证通过！真正掌握
                await prisma.errorItem.update({
                    where: {
                        id: schedule.errorItemId,
                    },
                    data: {
                        masteryLevel: 3, // 已验证掌握
                        verificationRequired: false,
                        verificationPassed: true,
                    },
                });

                // 按艾宾浩斯遗忘曲线安排长期维护复习（90天 → 180天 → 365天 → 停止）
                const maintenanceIntervals = [90, 180, 365];
                const consecutiveCorrect = schedule.consecutiveCorrect || 0;
                
                if (consecutiveCorrect < maintenanceIntervals.length) {
                    // 还有后续的维护复习计划
                    const nextInterval = maintenanceIntervals[consecutiveCorrect];
                    const nextScheduledFor = new Date();
                    
                    await prisma.reviewSchedule.create({
                        data: {
                            errorItemId: schedule.errorItemId,
                            scheduledFor: nextScheduledFor,
                            reviewStage: 99, // 99 = 维护阶段
                            intervalDays: nextInterval,
                            easeFactor: schedule.easeFactor || 2.5,
                            consecutiveCorrect: consecutiveCorrect + 1,
                            phase: 'maintenance',
                        },
                    });

                    return Response.json({
                        success: true,
                        schedule: updatedSchedule,
                        verificationPassed: true,
                        message: `验证通过！已安排 ${nextInterval} 天后长期回顾`,
                        nextAction: 'maintenance_scheduled',
                        maintenanceStage: consecutiveCorrect + 1,
                        totalMaintenanceStages: maintenanceIntervals.length,
                    });
                } else {
                    // 所有维护复习已完成，不再安排后续复习
                    return Response.json({
                        success: true,
                        schedule: updatedSchedule,
                        verificationPassed: true,
                        message: '验证通过！题目已完全掌握，不再安排复习',
                        nextAction: 'dismiss',
                        maintenanceComplete: true,
                    });
                }
            } else {
                // 验证失败，回到复习流程
                await prisma.errorItem.update({
                    where: {
                        id: schedule.errorItemId,
                    },
                    data: {
                        masteryLevel: 1, // 回到学习中状态
                        verificationRequired: false,
                        verificationPassed: false,
                    },
                });

                // 使用 SM-2 算法计算下次复习时间
                const nextReview = calculateNextReview(
                    schedule.intervalDays || 1,
                    schedule.easeFactor || 2.5,
                    schedule.reviewStage || 0,
                    false // 验证失败视为答错
                );

                const nextScheduledFor = new Date();
                nextScheduledFor.setDate(nextScheduledFor.getDate() + nextReview.interval);

                await prisma.reviewSchedule.create({
                    data: {
                        errorItemId: schedule.errorItemId,
                        scheduledFor: nextScheduledFor,
                        reviewStage: nextReview.stage,
                        intervalDays: nextReview.interval,
                        easeFactor: nextReview.ease,
                        consecutiveCorrect: 0,
                        phase: 'normal',
                    },
                });

                return Response.json({
                    success: true,
                    schedule: updatedSchedule,
                    verificationPassed: false,
                    message: '验证未通过，已加入复习计划',
                    nextAction: 'continue_review',
                });
            }
        }

        // ========== 正常复习阶段逻辑 ==========

        // 检查是否需要进入验证阶段
        const newMasteryLevel = isCorrect ? currentMastery + 1 : currentMastery;

        if (isCorrect && newMasteryLevel >= 2) {
            // 达到掌握标准，需要验证
            await prisma.errorItem.update({
                where: {
                    id: schedule.errorItemId,
                },
                data: {
                    masteryLevel: 2, // 待验证掌握
                    verificationRequired: true,
                },
            });

            // 创建验证阶段的复习计划
            const verificationScheduledFor = new Date();
            
            await prisma.reviewSchedule.create({
                data: {
                    errorItemId: schedule.errorItemId,
                    scheduledFor: verificationScheduledFor,
                    reviewStage: 0,
                    intervalDays: 0,
                    easeFactor: schedule.easeFactor || 2.5,
                    consecutiveCorrect: 0,
                    phase: 'verification',
                },
            });

            return Response.json({
                success: true,
                schedule: updatedSchedule,
                needsVerification: true,
                message: '已达到掌握标准，请通过变式题验证',
                nextAction: 'verification',
            });
        } else if (!isCorrect) {
            // 答错了，重置 masteryLevel
            await prisma.errorItem.update({
                where: {
                    id: schedule.errorItemId,
                },
                data: {
                    masteryLevel: Math.max(0, currentMastery - 1),
                    verificationRequired: false,
                    verificationPassed: null,
                },
            });
        } else {
            // 答对了但未达到验证标准，正常更新
            await prisma.errorItem.update({
                where: {
                    id: schedule.errorItemId,
                },
                data: {
                    masteryLevel: newMasteryLevel,
                },
            });
        }

        // 使用 SM-2 算法计算下次复习时间
        const nextReview = calculateNextReview(
            schedule.intervalDays || 1,
            schedule.easeFactor || 2.5,
            schedule.reviewStage || 0,
            isCorrect
        );

        // 创建下一个复习计划
        const nextScheduledFor = new Date();
        nextScheduledFor.setDate(nextScheduledFor.getDate() + nextReview.interval);

        await prisma.reviewSchedule.create({
            data: {
                errorItemId: schedule.errorItemId,
                scheduledFor: nextScheduledFor,
                reviewStage: nextReview.stage,
                intervalDays: nextReview.interval,
                easeFactor: nextReview.ease,
                consecutiveCorrect: isCorrect ? (schedule.consecutiveCorrect || 0) + 1 : 0,
                phase: 'normal',
            },
        });

        return Response.json({
            success: true,
            schedule: updatedSchedule,
            nextReview: {
                scheduledFor: nextScheduledFor,
                stage: nextReview.stage,
                interval: nextReview.interval,
            },
            needsVerification: false,
        });

    } catch (error) {
        logger.error({ error }, 'Error completing review schedule');
        return internalError("Failed to complete review schedule");
    }
}

// 主 POST 处理器 - 根据路径分发请求
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    const { pathname, searchParams } = new URL(req.url);

    // 处理 /api/review-schedule/complete 路径
    if (pathname.includes('/complete')) {
        return COMPLETE_POST(req);
    }

    // 处理 /api/review-schedule?action=generate 路径
    const action = searchParams.get('action');
    if (action === 'generate') {
        return GENERATE_POST(req as NextRequest);
    }

    // 默认返回生成
    return GENERATE_POST(req as NextRequest);
}