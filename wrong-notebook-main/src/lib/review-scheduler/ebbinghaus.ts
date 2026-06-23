/**
 * 艾宾浩斯遗忘曲线复习调度器
 * 
 * 基于艾宾浩斯遗忘曲线，为错题生成科学复习计划：
 * 第1天、第2天、第4天、第7天、第15天、第30天
 */

export interface ReviewInterval {
    daysAfter: number;      // 距离添加后多少天复习
    label: string;           // 中文标签
    labelEn: string;         // 英文标签
}

export const EBINGHAUS_INTERVALS: ReviewInterval[] = [
    { daysAfter: 1, label: '第1次复习', labelEn: '1st Review' },
    { daysAfter: 2, label: '第2次复习', labelEn: '2nd Review' },
    { daysAfter: 4, label: '第3次复习', labelEn: '3rd Review' },
    { daysAfter: 7, label: '第4次复习', labelEn: '4th Review' },
    { daysAfter: 15, label: '第5次复习', labelEn: '5th Review' },
    { daysAfter: 30, label: '第6次复习', labelEn: '6th Review' },
];

/**
 * SM-2 Algorithm for calculating next review interval
 * Based on the user's performance, adjusts the review schedule
 */
export function calculateNextReview(
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
 * 为单个错题生成复习计划
 */
export function generateReviewSchedule(errorItemId: string, addedAt: Date): {
    schedules: Array<{
        errorItemId: string;
        scheduledFor: Date;
    }>;
} {
    const schedules = EBINGHAUS_INTERVALS.map(interval => {
        const scheduledFor = new Date(addedAt);
        scheduledFor.setDate(scheduledFor.getDate() + interval.daysAfter);
        return {
            errorItemId,
            scheduledFor,
        };
    });

    return { schedules };
}

/**
 * 获取今天的复习任务
 */
export function getTodaySchedules(
    allSchedules: Array<{
        errorItemId: string;
        scheduledFor: Date;
        completedAt: Date | null;
    }>,
    today: Date = new Date()
): Array<{
    errorItemId: string;
    scheduledFor: Date;
}> {
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    return allSchedules
        .filter(schedule => {
            const scheduledDate = new Date(schedule.scheduledFor);
            return scheduledDate >= startOfDay && scheduledDate <= endOfDay && !schedule.completedAt;
        })
        .map(({ errorItemId, scheduledFor }) => ({
            errorItemId,
            scheduledFor,
        }));
}

/**
 * 获取即将到来的复习任务（未来7天内）
 */
export function getUpcomingSchedules(
    allSchedules: Array<{
        errorItemId: string;
        scheduledFor: Date;
        completedAt: Date | null;
    }>,
    today: Date = new Date()
): Array<{
    errorItemId: string;
    scheduledFor: Date;
}> {
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);

    return allSchedules
        .filter(schedule => {
            const scheduledDate = new Date(schedule.scheduledFor);
            return scheduledDate > startOfDay && scheduledDate <= weekLater && !schedule.completedAt;
        })
        .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
        .map(({ errorItemId, scheduledFor }) => ({
            errorItemId,
            scheduledFor,
        }));
}

/**
 * 计算连续复习天数（打卡 streak）
 */
export function calculateStreak(
    allSchedules: Array<{
        scheduledFor: Date;
        completedAt: Date | null;
    }>,
    today: Date = new Date()
): number {
    // 按日期分组，统计每天完成的复习数量
    const completedDates = new Set<string>();
    
    allSchedules.forEach(schedule => {
        if (schedule.completedAt) {
            const dateStr = schedule.completedAt.toISOString().split('T')[0];
            completedDates.add(dateStr);
        }
    });

    let streak = 0;
    let currentDate = new Date(today);
    currentDate.setHours(0, 0, 0, 0);

    // 从今天开始往前数，如果某天有完成记录就继续，断了就停止
    while (true) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (completedDates.has(dateStr)) {
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            break;
        }
    }

    return streak;
}

/**
 * 标记复习任务为已完成
 */
export function markReviewComplete(
    scheduleId: string,
    isCorrect: boolean,
    allSchedules: Array<{
        id: string;
        errorItemId: string;
        scheduledFor: Date;
        completedAt: Date | null;
        isCorrect: boolean | null;
    }>
): {
    updatedSchedule: {
        id: string;
        errorItemId: string;
        scheduledFor: Date;
        completedAt: Date | null;
        isCorrect: boolean | null;
    } | null;
    allSchedulesUpdated: typeof allSchedules;
} {
    const now = new Date();
    
    const updatedSchedules = allSchedules.map(schedule => {
        if (schedule.id === scheduleId) {
            return {
                ...schedule,
                completedAt: now,
                isCorrect,
            };
        }
        return schedule;
    });

    const updatedSchedule = updatedSchedules.find(s => s.id === scheduleId) || null;

    return {
        updatedSchedule,
        allSchedulesUpdated: updatedSchedules,
    };
}
