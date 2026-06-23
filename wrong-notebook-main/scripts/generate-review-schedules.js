/**
 * 批量为现有错题生成复习计划
 * 运行: node scripts/generate-review-schedules.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log("🔄 开始为现有错题生成复习计划...");

    // 查找所有没有复习计划的错题
    const errorItemsWithoutSchedule = await prisma.errorItem.findMany({
        where: {
            reviewSchedules: {
                none: {},
            },
        },
        select: {
            id: true,
            createdAt: true,
            userId: true,
        },
    });

    console.log(`📊 找到 ${errorItemsWithoutSchedule.length} 个没有复习计划的错题`);

    const reviewIntervals = [1, 2, 4, 7, 15, 30];
    let totalGenerated = 0;

    for (const item of errorItemsWithoutSchedule) {
        for (const daysAfter of reviewIntervals) {
            const scheduledFor = new Date(item.createdAt);
            scheduledFor.setDate(scheduledFor.getDate() + daysAfter);

            await prisma.reviewSchedule.create({
                data: {
                    errorItemId: item.id,
                    scheduledFor,
                    reviewStage: 0,
                    intervalDays: daysAfter,
                    easeFactor: 2.5,
                    consecutiveCorrect: 0,
                },
            });
            totalGenerated++;
        }
    }

    console.log(`✅ 成功生成 ${totalGenerated} 个复习计划`);
    console.log(`📈 平均每个错题 ${reviewIntervals.length} 个复习节点`);
}

main()
    .catch((e) => {
        console.error("❌ 生成失败:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
