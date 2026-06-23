import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:error-items:mastery');

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            return unauthorized("Authentication required");
        }

        const { masteryLevel } = await req.json();

        // Verify ownership before update
        const existingItem = await prisma.errorItem.findUnique({
            where: { id },
            select: { 
                userId: true,
                masteryLevel: true,
            },
        });

        if (!existingItem) {
            return NextResponse.json({ message: "Item not found" }, { status: 404 });
        }

        if (existingItem.userId !== user.id) {
            return NextResponse.json({ message: "Not authorized to update this item" }, { status: 403 });
        }

        const currentMastery = existingItem.masteryLevel || 0;
        const targetMastery = masteryLevel ?? (currentMastery > 0 ? 0 : 1);

        // 设置为未掌握 (masteryLevel = 0)
        if (targetMastery === 0) {
            const errorItem = await prisma.errorItem.update({
                where: { id },
                data: { 
                    masteryLevel: 0,
                },
            });
            return NextResponse.json(errorItem);
        }

        // 设置为掌握 (masteryLevel = 1)
        if (targetMastery === 1) {
            // 如果当前未达到验证阈值，直接更新
            if (currentMastery < 2) {
                const errorItem = await prisma.errorItem.update({
                    where: { id },
                    data: { masteryLevel: 1 },
                });
                return NextResponse.json(errorItem);
            }
            
            // 如果已达到验证阈值(>=2)，进入验证阶段
            const errorItem = await prisma.errorItem.update({
                where: { id },
                data: { 
                    masteryLevel: 2,
                    verificationRequired: true,
                },
            });

            // 创建验证阶段的复习计划
            await prisma.reviewSchedule.create({
                data: {
                    errorItemId: id,
                    scheduledFor: new Date(),
                    reviewStage: 0,
                    intervalDays: 0,
                    easeFactor: 2.5,
                    consecutiveCorrect: 0,
                    phase: 'verification',
                },
            });

            return NextResponse.json(errorItem);
        }

        // 其他情况：直接更新
        const errorItem = await prisma.errorItem.update({
            where: { id },
            data: { masteryLevel: targetMastery },
        });

        return NextResponse.json(errorItem);
    } catch (error) {
        logger.error({ error, id }, 'Error updating mastery');
        return internalError("Failed to update error item: " + (error instanceof Error ? error.message : String(error)));
    }
}